from fastapi import APIRouter, WebSocket, WebSocketDisconnect, Query
from auth import decode_token
from ws_manager import manager

router = APIRouter()


@router.websocket("/ws")
async def websocket_endpoint(ws: WebSocket, token: str = Query(...)):
    payload = decode_token(token)
    if not payload:
        await ws.close(code=1008)
        return

    await manager.connect(ws)
    try:
        while True:
            # Keep connection alive; we only push from the server
            await ws.receive_text()
    except WebSocketDisconnect:
        pass
    finally:
        await manager.disconnect(ws)
