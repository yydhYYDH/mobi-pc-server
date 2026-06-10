from app.schemas.mnn import MnnStatus


class MnnServerService:
    def __init__(self) -> None:
        self._status = MnnStatus(state="stopped")

    def status(self) -> MnnStatus:
        return self._status

    def start(self) -> MnnStatus:
        self._status = MnnStatus(
            state="error",
            message="MNN server start is scaffolded. Build/configure 3rdparty/MNN first.",
        )
        return self._status

    def stop(self) -> MnnStatus:
        self._status = MnnStatus(state="stopped")
        return self._status

    def load_model(self, model_id: str) -> MnnStatus:
        self._status = MnnStatus(
            state=self._status.state,
            active_model_id=model_id,
            message="Model load is scaffolded. Wire this to the MNN server process.",
        )
        return self._status

