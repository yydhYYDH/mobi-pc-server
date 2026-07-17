<p align="center">
  <img src="assets/icon-128.jpg" width="128" alt="Icon">
</p>

<h3 align="center">
ClawMate: A Proactive On-Device Agent System
</h3>

<h4 align="center">
ClawMate: 主动式端侧智能体系统
</h4>

<p align="center">
| <a href="https://arxiv.org/abs/2509.00531"><b>MobiAgent Paper</b></a> | <a href="https://arxiv.org/abs/2512.15784"><b>MobiMem Paper</b></a> | <a href="https://huggingface.co/collections/IPADS-SAI/mobimind-68b2aad150ccafd9d9e10e4d"><b>Hugging Face</b></a> | <a href="https://github.com/doulujiyao12/mobiinfer"><b>MobiInfer</b></a> |
</p>

<p align="center">
  <a href="README.en.md">English</a> | <a href="README.md">中文</a>
</p>

-----

<p align="center">
<img src="assets/app.jpg" height="280" alt="App screenshot">
<img src="assets/mobi-pc-server.png" width="280" alt="Desktop screenshot">
</p>

## News

- [2026.7.18] ClawMate HarmonyOS App and ClawMate Desktop are open-sourced.

### Demo Videos

<table>
  <tr>
    <td align="center" width="25%">
      <video src="https://github.com/user-attachments/assets/f26ee189-397b-4519-9381-47773f7802c0" controls width="220"></video>
      <br><small>Collect and organize phone data automatically</small>
    </td>
    <td align="center" width="25%">
      <video src="https://github.com/user-attachments/assets/80949978-e29e-48e0-91b1-14f60c2701c7" controls width="220"></video>
      <br><small>Exchange personal profiles with tap-to-share</small>
    </td>
    <td align="center" width="25%">
      <video src="https://github.com/user-attachments/assets/91e84083-a8b8-4cfe-b3ee-f4426d0ce1e7" controls width="220"></video>
      <br><small>Order a favorite milk tea</small>
    </td>
    <td align="center" width="25%">
      <video src="https://github.com/user-attachments/assets/198d0db7-7938-446a-81f1-73eaf45defd5" controls width="220"></video>
      <br><small>Buy a Huawei Pura X with Qwen</small>
    </td>
  </tr>
</table>

## Prerequisites

- HarmonyOS NEXT > 6.0
- Huawei developer platform: [DevEco Studio](https://developer.huawei.com/consumer/cn/deveco-studio/)
- Python > 3.10

## Installation

### HarmonyOS App

The HarmonyOS App source is managed as a Git submodule under `clawmate-harmonyAPP/`. Initialize the submodule before first use:

```bash
git submodule update --init clawmate-harmonyAPP
```

Source repository: [clawmate-harmonyAPP](https://github.com/doulujiyao12/mobiinfra-oh/tree/clawmate_dev)

#### Development Environment

1. Install [DevEco Studio](https://developer.huawei.com/consumer/cn/deveco-studio/). Use a version that supports HarmonyOS NEXT / API 20+.
2. In `Settings/Preferences > SDK > HarmonyOS > SDK Platforms`, install the matching Native SDK.
3. Add the `hdc` toolchain directory to `PATH`, then verify `hdc list targets`.
4. Python 3.10+.

#### Build and Run

Use DevEco Studio:

1. Open the `clawmate-harmonyAPP/` directory.
2. On the first build, let DevEco Studio generate `build-profile.json5`, then configure [automatic signing](https://developer.huawei.com/consumer/cn/doc/harmonyos-guides/ide-signing#section18815157237) or [manual signing](https://developer.huawei.com/consumer/cn/doc/harmonyos-guides/ide-signing#section297715173233).
3. Select the `entry` module and the target device.
4. Click Run / Debug to install on a HarmonyOS NEXT phone. Developer mode must be enabled on the phone.

### Desktop App

Download prebuilt installers from the [Release page](https://github.com/IPADS-SAI/ClawMate/releases).

| Platform | Download |
|--|--|
| macOS (Apple Silicon) | ClawMate-desktop-mac-arm64.dmg |
| Windows | ClawMate-desktop-windows-x64.exe |
| Linux | ClawMate-desktop-linux-x64.AppImage |

- Windows: run the `.exe` installer.
- macOS: open the `.dmg` and drag the app to Applications.
- Linux: mark the `.AppImage` executable and run it.

On first launch, bundled configuration is copied to the user data directory. Models, logs, and cache are stored in the system user data directory. They are not written into the install directory during app upgrades.

You can also build the desktop app from source. See [build.md](docs/build.md).

## Model Inference

ClawMate uses [MobiAgent](https://github.com/IPADS-SAI/MobiAgent) as the model inference framework and [MobiInfer](https://github.com/doulujiyao12/mobiinfer) as the HarmonyOS NEXT on-device inference engine. MobiInfer loads quantized on-device models on the phone and provides local inference for the GUI Agent, personal data understanding, and recommendation features.

Use the default model and runtime configuration:

- Inference framework: [MobiAgent](https://github.com/IPADS-SAI/MobiAgent)
- Inference engine: [MobiInfer](https://github.com/doulujiyao12/mobiinfer)
- Quantization tool: [mobi-autoround](https://github.com/doulujiyao12/mobi-autoround)
- Model source: [MobiMind](https://www.modelscope.cn/models/fengerhu1/MobiMind-1.5-2B-W8A8-0717)

ClawMate Desktop handles model download, runtime startup, log viewing, and HDC connection management. Usually you do not need to replace the inference engine manually. To build MobiInfer from source or debug the runtime, see the [MobiInfer repository](https://github.com/doulujiyao12/mobiinfer).

----

## Citation

If you find this work useful, please cite:

```bibtex
@article{zhang2025mobiagent,
  title={MobiAgent: A Systematic Framework for Customizable Mobile Agents},
  author={Zhang, Cheng and Feng, Erhu and Zhao, Xi and Zhao, Yisheng and Gong, Wangbo and Sun, Jiahui and Du, Dong and Hua, Zhichao and Xia, Yubin and Chen, Haibo},
  journal={arXiv preprint arXiv:2509.00531},
  year={2025}
}

@article{liu2025beyond,
  title={Beyond Training: Enabling Self-Evolution of Agents with MOBIMEM},
  author={Liu, Zibin and Zhang, Cheng and Zhao, Xi and Feng, Yunfei and Bai, Bingyu and Feng, Dahu and Feng, Erhu and Xia, Yubin and Chen, Haibo},
  journal={arXiv preprint arXiv:2512.15784},
  year={2025}
}
```

## Acknowledgements

- [MobiAgent](https://github.com/IPADS-SAI/MobiAgent): ClawMate's on-device GUI Agent capability follows and extends the MobiAgent research direction.
- [MobiMem](https://arxiv.org/abs/2512.15784): ClawMate's personal data understanding and memory capability refers to MobiMem's design.
- [MobiInfer](https://github.com/doulujiyao12/mobiinfer): provides the HarmonyOS on-device inference runtime.
- [MNN](https://github.com/alibaba/MNN): MobiInfer is built on MNN, which provides the underlying inference capability.
- [llama.cpp](https://github.com/ggml-org/llama.cpp): provides desktop-side llama.cpp runtime support.
