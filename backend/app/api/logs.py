from fastapi import APIRouter

from app.services.logs import LogService


router = APIRouter()
service = LogService()


@router.get("/mnncli")
def mnncli_log(lines: int = 120) -> dict[str, str]:
    return {"content": service.tail("mnncli.log", lines)}

