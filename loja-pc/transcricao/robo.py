"""
Robô de transcrição dos áudios do Zap — roda no PC da loja, no Docker do WSL, como a Evolution e
o robô da Receita. Sem custo por áudio: o Whisper (faster-whisper, CPU) roda aqui mesmo.

A cada volta: pergunta à função zap-transcrever quais áudios ainda não têm texto, baixa cada um
pelo link assinado, transcreve em português e devolve o texto. O painel mostra embaixo do áudio
no Atendimento, e o montar-pedido lê junto com a conversa.

O modelo (MODELO no chave.env) é baixado na primeira vez e fica no volume /modelos. O padrão é o
large-v3-turbo: em 03/11/2026 o "small" errava palavras ("algado", "me comendo"); o turbo acertou,
uns 3 s por áudio de 20 s no Mac (no PC da loja, mais lento, mas ainda bem antes de alguém abrir).
"""
import datetime as dt, json, os, tempfile, time, traceback, urllib.request
from faster_whisper import WhisperModel

SUPABASE_URL = os.environ["SUPABASE_URL"].rstrip("/")
SEGREDO = os.environ["TRANSCRICAO_SEGREDO"]
MODELO = os.environ.get("MODELO", "large-v3-turbo")
INTERVALO = int(os.environ.get("INTERVALO_SEGUNDOS", "20"))
FUNCAO = f"{SUPABASE_URL}/functions/v1/zap-transcrever"
# palavras da loja: sem isso o Whisper escreve "algado", "me comendo" (encomendando), "fobram" (cobram)
VOCABULARIO = ("Conversa de WhatsApp com a Coxelli, loja de salgados em Natal. Salgados, salgado, cento, meio cento, "
               "encomenda, encomendar, coxinha, bolinha de queijo, travesseiro sertanejo, enroladinho, croquete de "
               "calabresa, pastel, pastéis, churros, empada, quiche, congelados, fritos, Pix, sinal, entrega, "
               "retirada, Parnamirim, Pajuçara, Zona Norte.")


def log(*a):
    print(dt.datetime.now().strftime("%d/%m %H:%M:%S"), *a, flush=True)


def chamar(acao, **dados):
    req = urllib.request.Request(FUNCAO, data=json.dumps({"acao": acao, **dados}).encode(),
                                 headers={"Content-Type": "application/json", "x-robo-segredo": SEGREDO})
    with urllib.request.urlopen(req, timeout=60) as r:
        return json.loads(r.read())


def baixar(url):
    with urllib.request.urlopen(url, timeout=120) as r:
        f = tempfile.NamedTemporaryFile(suffix=".ogg", delete=False)
        f.write(r.read()); f.close()
        return f.name


log("carregando o modelo", MODELO, "(na primeira vez ele baixa, demora uns minutos)")
modelo = WhisperModel(MODELO, device="cpu", compute_type="int8", download_root=os.environ.get("MODELOS", "/modelos"))
log("modelo pronto")

ultimo_pulso = 0
while True:
    try:
        if time.time() - ultimo_pulso > 600:
            chamar("pulso", modelo=MODELO)
            ultimo_pulso = time.time()
        audios = chamar("pendentes").get("audios", [])
        for a in audios:
            arquivo = None
            try:
                arquivo = baixar(a["url"])
                inicio = time.time()
                partes, info = modelo.transcribe(arquivo, language="pt", vad_filter=True, beam_size=5,
                                                 initial_prompt=VOCABULARIO)
                texto = " ".join(p.text.strip() for p in partes).strip()
                chamar("resultado", id=a["id"], texto=texto, erro=None if texto else "sem fala")
                log(f"áudio {a['id']}: {info.duration:.0f}s em {time.time() - inicio:.0f}s →", texto[:80])
            except Exception as e:
                log("falhou o áudio", a.get("id"), e)
                chamar("resultado", id=a["id"], erro=str(e)[:300])
            finally:
                if arquivo and os.path.exists(arquivo):
                    os.unlink(arquivo)
        if not audios:
            time.sleep(INTERVALO)
    except Exception:
        traceback.print_exc()
        time.sleep(60)
