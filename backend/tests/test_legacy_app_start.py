import subprocess

import pytest

from app.legacy import harmony_agent
from app.legacy import hdc_server


def completed(cmd: str, stdout: str = "", stderr: str = "", returncode: int = 0) -> subprocess.CompletedProcess[str]:
    return subprocess.CompletedProcess(cmd, returncode, stdout, stderr)


@pytest.fixture(autouse=True)
def reset_hdc_server_log_sink() -> None:
    hdc_server.set_log_sink(None)
    yield
    hdc_server.set_log_sink(None)


def test_launch_app_uses_module_name_from_bm_dump(monkeypatch: pytest.MonkeyPatch) -> None:
    commands: list[str] = []
    bundle = "com.xingin.xhs_hos"
    bm_dump = """
    bundleName: com.xingin.xhs_hos
    entryModuleName: redbook
    mainEntry: redbook
    hapModuleInfos:
      - moduleName: redbook
        mainAbility: EntryAbility
        mainElementName: EntryAbility
    """

    monkeypatch.setattr(harmony_agent, "run_with_device_control", lambda _name, operation: operation())
    monkeypatch.setattr(harmony_agent, "get_main_ability_for_bundle", lambda _bundle: "EntryAbility")
    monkeypatch.setattr(harmony_agent, "ensure_driver_available", lambda: False)
    monkeypatch.setattr(harmony_agent, "hdc_prefix", lambda force=False: "hdc -t 4QE0225916013634")
    monkeypatch.setattr(harmony_agent, "stop_app_before_launch", lambda _bundle: None)
    monkeypatch.setattr(harmony_agent.time, "sleep", lambda _seconds: None)

    def fake_run_timed(
        label: str,
        cmd: str,
        capture_output: bool = True,
        timeout: float = harmony_agent.HDC_COMMAND_TIMEOUT,
    ) -> subprocess.CompletedProcess[str]:
        commands.append(cmd)
        if " shell bm dump -n " in cmd:
            return completed(cmd, stdout=bm_dump)
        return completed(cmd)

    monkeypatch.setattr(harmony_agent, "_run_timed_command", fake_run_timed)

    assert harmony_agent.launch_app("小红书", reset_first=False) is True

    assert any(f"shell bm dump -n {bundle}" in command for command in commands)
    start_commands = [command for command in commands if " shell aa start " in command]
    assert start_commands == [
        f"hdc -t 4QE0225916013634 shell aa start -a EntryAbility -b {bundle} -m redbook"
    ]


def test_parse_app_launch_target_handles_json_main_entry_module() -> None:
    bm_dump = """
com.xingin.xhs_hos:
{
  "entryModuleName": "redbook",
  "mainEntry": "redbook",
  "hapModuleInfos": [
    {
      "moduleName": "ApiCenter",
      "mainAbility": "",
      "mainElementName": ""
    },
    {
      "moduleName": "redbook",
      "mainAbility": "EntryAbility",
      "mainElementName": "EntryAbility"
    }
  ]
}
"""

    assert harmony_agent.parse_app_launch_target_from_bm_dump(bm_dump) == {
        "module_name": "redbook",
        "ability_name": "EntryAbility",
    }


def test_apps_use_entry_ability_as_generic_launch_candidate() -> None:
    assert harmony_agent.ability_candidates_for_bundle("com.huawei.hmos.browser") == ["EntryAbility"]


def test_launch_app_uses_entry_ability_candidate_when_bm_dump_fails(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    commands: list[str] = []
    bundle = "com.tencent.wechat"

    monkeypatch.setattr(harmony_agent, "run_with_device_control", lambda _name, operation: operation())
    monkeypatch.setattr(harmony_agent, "get_main_ability_for_bundle", lambda _bundle: "")
    monkeypatch.setattr(harmony_agent, "ensure_driver_available", lambda: False)
    monkeypatch.setattr(harmony_agent, "hdc_prefix", lambda force=False: "hdc")
    monkeypatch.setattr(harmony_agent.time, "sleep", lambda _seconds: None)

    def fake_run_timed(
        label: str,
        cmd: str,
        capture_output: bool = True,
        timeout: float = harmony_agent.HDC_COMMAND_TIMEOUT,
    ) -> subprocess.CompletedProcess[str]:
        commands.append(cmd)
        if " shell bm dump -n " in cmd:
            raise RuntimeError("bm dump unavailable")
        return completed(cmd)

    monkeypatch.setattr(harmony_agent, "_run_timed_command", fake_run_timed)

    assert harmony_agent.launch_app(bundle, reset_first=False) is True
    assert f"hdc shell aa start -a EntryAbility -b {bundle}" in commands


def test_build_app_start_result_errors_when_foreground_verification_fails(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    class FakeHarmonyAgent:
        APP_MAPPING = {"小红书": "com.xingin.xhs_hos"}

        @staticmethod
        def launch_app(target: str, reset_first: bool = True) -> bool:
            assert target == "小红书"
            assert reset_first is False
            return True

    monkeypatch.setattr(hdc_server, "harmony_agent", FakeHarmonyAgent)
    monkeypatch.setattr(
        hdc_server,
        "detect_current_foreground_package_name",
        lambda expected_package_name="": "com.clawmate.app.test",
    )

    result = hdc_server.build_app_start_result("小红书", "", reset_first=False)

    assert result == {
        "status": "error",
        "message": (
            "app_start verification failed: expected com.xingin.xhs_hos, "
            "current com.clawmate.app.test"
        ),
        "package_name": "com.xingin.xhs_hos",
        "current_package_name": "com.clawmate.app.test",
    }


def test_build_app_start_result_waits_for_expected_foreground_package(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    class FakeHarmonyAgent:
        APP_MAPPING = {"微信": "com.tencent.wechat"}

        @staticmethod
        def launch_app(target: str, reset_first: bool = True) -> bool:
            assert target == "微信"
            assert reset_first is True
            return True

    foreground_packages = iter(["com.clawmate.app", "com.tencent.wechat"])
    sleeps: list[float] = []

    monkeypatch.setattr(hdc_server, "harmony_agent", FakeHarmonyAgent)
    monkeypatch.setattr(hdc_server, "HDC_APP_START_VERIFY_TIMEOUT", 1.5)
    monkeypatch.setattr(hdc_server, "HDC_APP_START_VERIFY_INTERVAL", 0.1)
    monkeypatch.setattr(hdc_server.time, "sleep", lambda seconds: sleeps.append(seconds))
    monkeypatch.setattr(
        hdc_server,
        "detect_current_foreground_package_name",
        lambda expected_package_name="": next(foreground_packages),
    )

    result = hdc_server.build_app_start_result("微信", "com.tencent.wechat", reset_first=True)

    assert result == {
        "status": "ok",
        "message": "app_start 微信",
        "package_name": "com.tencent.wechat",
        "current_package_name": "com.tencent.wechat",
    }
    assert sleeps == [0.1]


def test_extract_foreground_package_name_from_bracketed_mission_list() -> None:
    mission_list = """
User ID #100
  current mission lists:{
    Mission ID #100  mission name #[#com.clawmate.app:entry:EntryAbility]  lockedState #0
      AbilityRecord ID #1228
        app name [com.clawmate.app]
        bundle name [com.clawmate.app]
        state #BACKGROUND
        app state #FOREGROUND
    Mission ID #101  mission name #[#com.tencent.wechat:entry:EntryAbility]  lockedState #0
      AbilityRecord ID #1229
        app name [com.tencent.wechat]
        main name [EntryAbility]
        bundle name [com.tencent.wechat]
        state #BACKGROUND
        app state #BACKGROUND
    Mission ID #115  mission name #[#com.clawmate.app:entry:EntryAbility]  lockedState #0
      AbilityRecord ID #1552
        app name [com.clawmate.app]
        main name [EntryAbility]
        bundle name [com.clawmate.app]
        state #FOREGROUND
        app state #FOREGROUND
 }
"""

    assert hdc_server.extract_foreground_package_name(mission_list) == "com.clawmate.app"


def test_extract_foreground_package_name_prefers_ability_state_over_app_state() -> None:
    mission_list = """
User ID #100
  current mission lists:{
    Mission ID #154  mission name #[#com.clawmate.app.npu_offline:entry:EntryAbility]  lockedState #0
      AbilityRecord ID #1555
        app name [com.clawmate.app.npu_offline]
        bundle name [com.clawmate.app.npu_offline]
        state #BACKGROUND
        app state #FOREGROUND
    Mission ID #157  mission name #[#com.xingin.xhs_hos:redbook:EntryAbility]  lockedState #0
      AbilityRecord ID #1563
        app name [com.xingin.xhs_hos]
        bundle name [com.xingin.xhs_hos]
        state #FOREGROUND
        app state #FOREGROUND
 }
"""

    assert hdc_server.extract_foreground_package_name(mission_list) == "com.xingin.xhs_hos"


def test_build_app_start_result_accepts_matching_bracketed_foreground(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    mission_list = """
User ID #100
  current mission lists:{
    Mission ID #101  mission name #[#com.tencent.wechat:entry:EntryAbility]  lockedState #0
      AbilityRecord ID #1229
        app name [com.tencent.wechat]
        bundle name [com.tencent.wechat]
        state #BACKGROUND
    Mission ID #116  mission name #[#com.xingin.xhs_hos:redbook:EntryAbility]  lockedState #0
      AbilityRecord ID #1553
        app name [com.xingin.xhs_hos]
        bundle name [com.xingin.xhs_hos]
        state #FOREGROUND
        app state #FOREGROUND
 }
"""

    class FakeHarmonyAgent:
        APP_MAPPING = {"小红书": "com.xingin.xhs_hos"}

        @staticmethod
        def launch_app(target: str, reset_first: bool = True) -> bool:
            assert target == "小红书"
            assert reset_first is False
            return True

    monkeypatch.setattr(hdc_server, "harmony_agent", FakeHarmonyAgent)
    monkeypatch.setattr(
        hdc_server,
        "run_hdc_command_capture",
        lambda command, timeout=None: completed(command, stdout=mission_list),
    )

    result = hdc_server.build_app_start_result("小红书", "", reset_first=False)

    assert result == {
        "status": "ok",
        "message": "app_start 小红书",
        "package_name": "com.xingin.xhs_hos",
        "current_package_name": "com.xingin.xhs_hos",
    }


def test_build_app_start_result_prefers_expected_foreground_package(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    mission_list = """
User ID #100
  current mission lists:{
    Mission ID #101  mission name #[#com.clawmate.app.test:entry:EntryAbility]  lockedState #0
      AbilityRecord ID #1229
        app name [com.clawmate.app.test]
        bundle name [com.clawmate.app.test]
        state #FOREGROUND
        app state #FOREGROUND
    Mission ID #116  mission name #[#com.huawei.hmos.browser:entry:MainAbility]  lockedState #0
      AbilityRecord ID #1553
        app name [com.huawei.hmos.browser]
        bundle name [com.huawei.hmos.browser]
        state #FOREGROUND
        app state #FOREGROUND
 }
"""

    class FakeHarmonyAgent:
        APP_MAPPING = {"浏览器": "com.huawei.hmos.browser"}

        @staticmethod
        def launch_app(target: str, reset_first: bool = True) -> bool:
            assert target == "浏览器"
            assert reset_first is False
            return True

    monkeypatch.setattr(hdc_server, "harmony_agent", FakeHarmonyAgent)
    monkeypatch.setattr(
        hdc_server,
        "run_hdc_command_capture",
        lambda command, timeout=None: completed(command, stdout=mission_list),
    )

    result = hdc_server.build_app_start_result("浏览器", "", reset_first=False)

    assert result == {
        "status": "ok",
        "message": "app_start 浏览器",
        "package_name": "com.huawei.hmos.browser",
        "current_package_name": "com.huawei.hmos.browser",
    }


def test_workflow_action_writes_action_and_payload_to_log_sink(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    logs: list[str] = []

    class FakeHarmonyAgent:
        @staticmethod
        def run_with_device_control(_name: str, operation):
            return operation()

    monkeypatch.setattr(hdc_server, "harmony_agent", FakeHarmonyAgent)
    monkeypatch.setattr(hdc_server, "ensure_workflow_agent_ready", lambda: None)
    monkeypatch.setattr(hdc_server, "run_hdc_command", lambda _cmd: "")
    monkeypatch.setattr(hdc_server, "hdc_prefix", lambda: "hdc -t 4QE0225916013634")
    hdc_server.set_log_sink(logs.append)

    result = hdc_server.handle_workflow_action(
        "gui_action",
        {
            "action": "click",
            "target_element": "第一个帖子",
            "x": 320,
            "y": 640,
            "width": 1080,
            "height": 2400,
        },
    )

    assert result == {"status": "ok", "message": "click 320,640"}
    assert any("action=gui_action" in line and "第一个帖子" in line for line in logs)
    assert any("[HDC操作]" in line and "点击" in line and "坐标=320,640" in line for line in logs)


def test_workflow_click_input_driver_uses_uiinput_text_shell(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    calls: list[tuple[str, str | int]] = []

    class FakeDriver:
        def click(self, x: int, y: int) -> None:
            calls.append(("click", f"{x},{y}"))

        def shell(self, command: str) -> None:
            calls.append(("shell", command))

        def press_key(self, key: int) -> None:
            calls.append(("press_key", key))

    class FakeHarmonyAgent:
        d = FakeDriver()
        DEVICE_WAIT_TIME = 0

        @staticmethod
        def run_with_device_control(_name: str, operation):
            return operation()

        @staticmethod
        def run_driver_call(_name: str, operation):
            return operation(FakeHarmonyAgent.d)

        @staticmethod
        def press_harmony_key(key_name: str, fallback_code: int) -> None:
            calls.append(("press_harmony_key", f"{key_name}:{fallback_code}"))

    monkeypatch.setattr(hdc_server, "harmony_agent", FakeHarmonyAgent)
    monkeypatch.setattr(hdc_server, "ensure_workflow_agent_ready", lambda: None)
    monkeypatch.setattr(hdc_server.time, "sleep", lambda _seconds: None)

    result = hdc_server.handle_workflow_action(
        "gui_action",
        {
            "action": "click_input",
            "x": 469,
            "y": 2204,
            "text": "购买充电宝",
            "target_element": "底部输入框",
        },
    )

    assert result == {"status": "ok", "message": "click_input 469,2204"}
    assert ("click", "469,2204") in calls
    assert ("shell", "uitest uiInput text '购买充电宝'") in calls
    assert not any(call[0] == "input_text" for call in calls)


def test_workflow_click_input_hdc_fallback_uses_uiinput_text(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    commands: list[str] = []

    class FakeHarmonyAgent:
        d = None
        DEVICE_WAIT_TIME = 0

        @staticmethod
        def run_with_device_control(_name: str, operation):
            return operation()

        @staticmethod
        def ensure_driver_available() -> bool:
            return False

    monkeypatch.setattr(hdc_server, "harmony_agent", FakeHarmonyAgent)
    monkeypatch.setattr(hdc_server, "ensure_workflow_agent_ready", lambda: None)
    monkeypatch.setattr(hdc_server, "hdc_prefix", lambda: "hdc -t 4QE0225916013634")
    monkeypatch.setattr(hdc_server, "run_hdc_command", commands.append)
    monkeypatch.setattr(hdc_server.time, "sleep", lambda _seconds: None)

    result = hdc_server.handle_workflow_action(
        "gui_action",
        {
            "action": "click_input",
            "x": 469,
            "y": 2204,
            "text": "购买充电宝",
        },
    )

    assert result == {"status": "ok", "message": "click_input 469,2204"}
    assert commands == [
        "hdc -t 4QE0225916013634 shell uitest uiInput click 469 2204",
        "hdc -t 4QE0225916013634 shell uitest uiInput text '购买充电宝'",
    ]
