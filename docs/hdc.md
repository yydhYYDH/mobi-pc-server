# HarmonyOS hdc Integration

The backend owns all `hdc` interactions.

Expected first capabilities:

- Detect `hdc` on `PATH`.
- Run `hdc list targets`.
- Parse connected devices into structured API responses.
- Add explicit connect and disconnect endpoints.

Do not expose a generic arbitrary-command endpoint to the frontend.

