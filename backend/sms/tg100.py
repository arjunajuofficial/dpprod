import urllib.parse
import httpx


async def send_sms(
    host: str,
    gsm_port: str | int,
    username: str,
    password: str,
    phone: str,
    message: str,
) -> tuple[bool, str]:
    """
    Send SMS via Yeastar TG100 HTTP API.

    Tested URL format:
        http://{host}/cgi/WebCGI?1500101=account={user}&password={pass}&port={gsm_port}&destination={phone}&content={encoded_msg}

    gsm_port  = GSM port NUMBER on the TG100 device (usually 1 for TG100 which has 1 SIM)
    host      = IP address of TG100 (HTTP runs on port 80 by default — no port needed in URL)
    """
    encoded_message = urllib.parse.quote(message)
    url = (
        f"http://{host}/cgi/WebCGI?1500101="
        f"account={username}&password={password}&port={gsm_port}"
        f"&destination={phone}&content={encoded_message}"
    )

    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            r = await client.get(url)
            ok = r.status_code == 200
            return ok, r.text
    except httpx.TimeoutException:
        return False, "timeout"
    except Exception as e:
        return False, str(e)
