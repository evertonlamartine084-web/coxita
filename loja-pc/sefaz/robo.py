"""
Robô da Receita (NF-e de compra) — roda no PC da loja, dentro do Docker do WSL, como a Evolution.

O que ele faz, a cada meia hora:
  1. pergunta à Receita (NFeDistribuicaoDFe, distNSU) o que há de novo para o CNPJ da Coxelli;
  2. para cada nota nova (resumo resNFe), manda o evento "Ciência da Operação" assinado com o
     certificado A1 — é isso que libera o XML completo para o destinatário;
  3. pede o XML completo pela chave (consChNFe) e entrega para a função `nfe-receber` da Supabase,
     que lança a compra no painel para conferência e depois nas planilhas.

Por que aqui e não na nuvem: a Receita derruba a conexão vinda da Supabase ("connection reset");
do IP da loja funciona. O certificado fica só neste PC (certificado.pfx + senha em chave.env).

Estado em estado.json (volume): ultNSU já lido e chaves que ainda esperam o XML completo.
A Receita impõe: quando não há nada novo, só uma consulta por hora (cStat 656) — o Bling usa o
mesmo certificado e também consulta, então um 656 é "espere", não erro.
"""
import base64, datetime as dt, gzip, json, os, re, ssl, sys, tempfile, time, traceback, urllib.request
from cryptography import x509
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import padding
from cryptography.hazmat.primitives.serialization import pkcs12, Encoding, PrivateFormat, NoEncryption

CNPJ = os.environ.get("CNPJ", "68484975000176")
UF_AUTOR = os.environ.get("UF_AUTOR", "24")
PFX = os.environ.get("PFX", "/app/certificado.pfx")
PFX_SENHA = os.environ["PFX_SENHA"]
SUPABASE_URL = os.environ["SUPABASE_URL"].rstrip("/")
ROBO_SEGREDO = os.environ["NFE_ROBO_SEGREDO"]
ESTADO = os.environ.get("ESTADO", "/dados/estado.json")
INTERVALO = int(os.environ.get("INTERVALO_SEGUNDOS", "1800"))
TPAMB = "1"

URL_DFE = "https://www1.nfe.fazenda.gov.br/NFeDistribuicaoDFe/NFeDistribuicaoDFe.asmx"
URL_EVENTO = "https://www.nfe.fazenda.gov.br/NFeRecepcaoEvento4/NFeRecepcaoEvento4.asmx"
NS = "http://www.portalfiscal.inf.br/nfe"
DSIG = "http://www.w3.org/2000/09/xmldsig#"


def log(*a):
    print(dt.datetime.now().strftime("%d/%m %H:%M:%S"), *a, flush=True)


# ------------------------------------------------------------------ certificado

def carregar_certificado():
    chave, cert, extras = pkcs12.load_key_and_certificates(open(PFX, "rb").read(), PFX_SENHA.encode())
    pem = cert.public_bytes(Encoding.PEM) + chave.private_bytes(Encoding.PEM, PrivateFormat.PKCS8, NoEncryption())
    for c in extras or []:
        pem += c.public_bytes(Encoding.PEM)
    f = tempfile.NamedTemporaryFile(suffix=".pem", delete=False)
    f.write(pem); f.close()
    ctx = ssl.create_default_context()
    ctx.load_cert_chain(f.name)
    os.unlink(f.name)
    return chave, cert, ctx


CHAVE_PRIV, CERT, CTX = carregar_certificado()
log("certificado:", CERT.subject.rfc4514_string()[:60], "válido até", CERT.not_valid_after_utc.date())


# ------------------------------------------------------------------ SOAP

def soap(url, acao_ns, dados, envoltorio=None):
    corpo = f'<nfeDadosMsg>{dados}</nfeDadosMsg>'
    corpo = f'<{envoltorio} xmlns="{acao_ns}">{corpo}</{envoltorio}>' if envoltorio else f'<nfeDadosMsg xmlns="{acao_ns}">{dados}</nfeDadosMsg>'
    envelope = f"""<?xml version="1.0" encoding="utf-8"?>
<soap12:Envelope xmlns:soap12="http://www.w3.org/2003/05/soap-envelope">
  <soap12:Body>{corpo}</soap12:Body>
</soap12:Envelope>"""
    req = urllib.request.Request(url, data=envelope.encode("utf-8"),
                                 headers={"Content-Type": "application/soap+xml; charset=utf-8"})
    try:
        r = urllib.request.urlopen(req, context=CTX, timeout=90)
        return r.read().decode("utf-8", "replace")
    except urllib.error.HTTPError as e:
        return e.read().decode("utf-8", "replace")


def tag(xml, nome):
    m = re.search(rf"<{nome}>([^<]*)</{nome}>", xml)
    return m.group(1) if m else None


# ------------------------------------------------------------------ distribuição

def dist_dfe(consulta):
    dados = (f'<distDFeInt xmlns="{NS}" versao="1.01"><tpAmb>{TPAMB}</tpAmb><cUFAutor>{UF_AUTOR}</cUFAutor>'
             f'<CNPJ>{CNPJ}</CNPJ>{consulta}</distDFeInt>')
    # no serviço de distribuição o nfeDadosMsg fica dentro de <nfeDistDFeInteresse> (no evento, não)
    resposta = soap(URL_DFE, "http://www.portalfiscal.inf.br/nfe/wsdl/NFeDistribuicaoDFe", dados,
                    envoltorio="nfeDistDFeInteresse")
    docs = []
    for m in re.finditer(r'<docZip[^>]*NSU="(\d+)"[^>]*schema="([^"]+)"[^>]*>([^<]+)</docZip>', resposta):
        docs.append({"nsu": m.group(1), "schema": m.group(2),
                     "xml": gzip.decompress(base64.b64decode(m.group(3))).decode("utf-8", "replace")})
    return {"cStat": tag(resposta, "cStat"), "xMotivo": tag(resposta, "xMotivo"),
            "ultNSU": tag(resposta, "ultNSU"), "maxNSU": tag(resposta, "maxNSU"), "docs": docs, "bruto": resposta}


# ------------------------------------------------------------------ assinatura (xmldsig, como a Receita exige)

from lxml import etree  # noqa: E402  (c14n de verdade; o ElementTree não tem)


def c14n(elemento):
    return etree.tostring(elemento, method="c14n", exclusive=False, with_comments=False)


def assinar_evento(inf_evento_xml, id_):
    """<Signature> enveloped do infEvento: SHA-1 + RSA sobre o C14N, como pede o manual da NF-e.
    O SignedInfo é montado como árvore e canonicalizado antes de assinar: a Receita recalcula o
    C14N dele, e um <Transform/> auto-fechado assinado "em texto" não bate com <Transform></Transform>."""
    inf = etree.fromstring(inf_evento_xml.encode("utf-8"))
    digest = base64.b64encode(_sha1(c14n(inf))).decode()
    si = etree.fromstring(
        f'<SignedInfo xmlns="{DSIG}">'
        f'<CanonicalizationMethod Algorithm="http://www.w3.org/TR/2001/REC-xml-c14n-20010315"/>'
        f'<SignatureMethod Algorithm="http://www.w3.org/2000/09/xmldsig#rsa-sha1"/>'
        f'<Reference URI="#{id_}"><Transforms>'
        f'<Transform Algorithm="http://www.w3.org/2000/09/xmldsig#enveloped-signature"/>'
        f'<Transform Algorithm="http://www.w3.org/TR/2001/REC-xml-c14n-20010315"/>'
        f'</Transforms><DigestMethod Algorithm="http://www.w3.org/2000/09/xmldsig#sha1"/>'
        f'<DigestValue>{digest}</DigestValue></Reference></SignedInfo>'.encode("utf-8")
    )
    assinatura = CHAVE_PRIV.sign(c14n(si), padding.PKCS1v15(), hashes.SHA1())
    cert_b64 = base64.b64encode(CERT.public_bytes(Encoding.DER)).decode()
    signed_info = c14n(si).decode("utf-8")
    return (f'<Signature xmlns="{DSIG}">{signed_info}'
            f'<SignatureValue>{base64.b64encode(assinatura).decode()}</SignatureValue>'
            f'<KeyInfo><X509Data><X509Certificate>{cert_b64}</X509Certificate></X509Data></KeyInfo>'
            f'</Signature>')


def _sha1(dados):
    h = hashes.Hash(hashes.SHA1()); h.update(dados); return h.finalize()


def ciencia_da_operacao(chave):
    """Evento 210210 no Ambiente Nacional (cOrgao 91). cStat 135 = vinculado; 573 = já tinha."""
    agora = dt.datetime.now(dt.timezone(dt.timedelta(hours=-3))).strftime("%Y-%m-%dT%H:%M:%S-03:00")
    id_ = f"ID210210{chave}01"
    inf = (f'<infEvento xmlns="{NS}" Id="{id_}"><cOrgao>91</cOrgao><tpAmb>{TPAMB}</tpAmb><CNPJ>{CNPJ}</CNPJ>'
           f'<chNFe>{chave}</chNFe><dhEvento>{agora}</dhEvento><tpEvento>210210</tpEvento><nSeqEvento>1</nSeqEvento>'
           f'<verEvento>1.00</verEvento><detEvento versao="1.00"><descEvento>Ciencia da Operacao</descEvento></detEvento></infEvento>')
    assinatura = assinar_evento(inf, id_)
    # dentro do envEvento o namespace já está declarado: tira a repetição do infEvento
    inf_sem_ns = inf.replace(f' xmlns="{NS}"', "", 1)
    env = (f'<envEvento xmlns="{NS}" versao="1.00"><idLote>{int(time.time())}</idLote>'
           f'<evento versao="1.00">{inf_sem_ns}{assinatura}</evento></envEvento>')
    resposta = soap(URL_EVENTO, "http://www.portalfiscal.inf.br/nfe/wsdl/NFeRecepcaoEvento4", env)
    ret = re.search(r"<retEvento[\s\S]*?</retEvento>", resposta)
    bloco = ret.group(0) if ret else resposta
    return {"cStat": tag(bloco, "cStat"), "xMotivo": tag(bloco, "xMotivo"), "lote": tag(resposta, "cStat"), "bruto": resposta}


# ------------------------------------------------------------------ Supabase

def entregar(xml, nsu=None):
    req = urllib.request.Request(f"{SUPABASE_URL}/functions/v1/nfe-receber",
                                 data=json.dumps({"acao": "nfe", "xml": xml, "nsu": nsu}).encode(),
                                 headers={"Content-Type": "application/json", "x-robo-segredo": ROBO_SEGREDO})
    try:
        r = urllib.request.urlopen(req, timeout=60)
        return r.status, json.loads(r.read() or b"{}")
    except urllib.error.HTTPError as e:
        corpo = e.read()
        try:
            return e.code, json.loads(corpo)
        except Exception:
            return e.code, {"erro": corpo[:300].decode("utf-8", "replace")}


def pulso(estado, nota=""):
    try:
        req = urllib.request.Request(f"{SUPABASE_URL}/functions/v1/nfe-receber",
                                     data=json.dumps({"acao": "pulso", "ultNSU": estado.get("ultNSU"),
                                                      "pendentes": len(estado.get("pendentes", {})), "nota": nota}).encode(),
                                     headers={"Content-Type": "application/json", "x-robo-segredo": ROBO_SEGREDO})
        urllib.request.urlopen(req, timeout=30).read()
    except Exception as e:
        log("pulso falhou:", e)


# ------------------------------------------------------------------ estado

def ler_estado():
    try:
        return json.load(open(ESTADO))
    except Exception:
        return {"ultNSU": "000000000000000", "pendentes": {}, "entregues": []}


def gravar_estado(e):
    os.makedirs(os.path.dirname(ESTADO), exist_ok=True)
    tmp = ESTADO + ".tmp"
    json.dump(e, open(tmp, "w"), indent=1)
    os.replace(tmp, ESTADO)


# ------------------------------------------------------------------ ciclo

def tratar_documento(doc, estado):
    schema, xml = doc["schema"], doc["xml"]
    chave = tag(xml, "chNFe") or (re.search(r'Id="NFe(\d{44})"', xml) or [None, None])[1]
    if schema.startswith("procNFe"):
        if chave in estado["entregues"]:
            return
        st, resp = entregar(xml, doc["nsu"])
        log(f"  NF-e {chave} completa → painel: {st} {json.dumps(resp, ensure_ascii=False)[:120]}")
        if st == 200:
            estado["entregues"].append(chave)
            estado["pendentes"].pop(chave, None)
    elif schema.startswith("resNFe"):
        situacao = tag(xml, "cSitNFe")  # 1 autorizada, 2 denegada, 3 cancelada
        nome = tag(xml, "xNome"); valor = tag(xml, "vNF")
        if situacao != "1" or chave in estado["entregues"]:
            return
        log(f"  resumo: {nome} R$ {valor} chave {chave}")
        estado["pendentes"][chave] = {"nome": nome, "valor": valor, "desde": doc["nsu"], "ciencia": False}
    # resEvento / procEventoNFe: eventos (cancelamento etc.) não interessam por enquanto


def completar_pendentes(estado):
    for chave, p in list(estado["pendentes"].items()):
        if not p.get("ciencia"):
            r = ciencia_da_operacao(chave)
            log(f"  ciência {chave}: {r['cStat']} {r['xMotivo']}")
            if r["cStat"] in ("135", "573", "650"):
                p["ciencia"] = True
            else:
                continue
        r = dist_dfe(f"<consChNFe><chNFe>{chave}</chNFe></consChNFe>")
        completos = [d for d in r["docs"] if d["schema"].startswith("procNFe")]
        if completos:
            tratar_documento(completos[0], estado)
        else:
            log(f"  XML completo de {chave} ainda não veio ({r['cStat']} {r['xMotivo']})")
        time.sleep(2)


def ciclo(estado):
    while True:
        r = dist_dfe(f"<distNSU><ultNSU>{estado['ultNSU']}</ultNSU></distNSU>")
        log(f"distNSU desde {estado['ultNSU']}: {r['cStat']} {r['xMotivo']} ({len(r['docs'])} docs, ultNSU {r['ultNSU']}, maxNSU {r['maxNSU']})")
        if r["cStat"] == "656":
            return "656"
        if r["cStat"] not in ("137", "138"):
            return r["cStat"]
        for d in r["docs"]:
            tratar_documento(d, estado)
        if r["ultNSU"]:
            estado["ultNSU"] = r["ultNSU"]
        gravar_estado(estado)
        if r["cStat"] == "137" or (r["maxNSU"] and r["ultNSU"] and int(r["ultNSU"]) >= int(r["maxNSU"])):
            break
    completar_pendentes(estado)
    gravar_estado(estado)
    return "ok"


def main():
    if len(sys.argv) > 1 and sys.argv[1] == "chave":
        # modo manual: robo.py chave <44 dígitos> → ciência + XML, para testar uma nota
        chave = re.sub(r"\D", "", sys.argv[2])
        estado = ler_estado()
        estado["pendentes"][chave] = {"ciencia": False}
        completar_pendentes(estado)
        gravar_estado(estado)
        return
    estado = ler_estado()
    while True:
        try:
            resultado = ciclo(estado)
            pulso(estado, resultado)
            espera = 3700 if resultado == "656" else INTERVALO
        except Exception as e:
            log("erro no ciclo:", e)
            traceback.print_exc()
            espera = 600
        log(f"próximo ciclo em {espera // 60} min")
        time.sleep(espera)


if __name__ == "__main__":
    main()
