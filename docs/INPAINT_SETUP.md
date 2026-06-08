# Inpaint Setup

IdeaDraw's planned inpaint workspace uses:

- [ComfyUI-Inpaint-CropAndStitch](https://github.com/lquesada/ComfyUI-Inpaint-CropAndStitch)
- Qwen Image Edit FP8
- Qwen 2.5 VL 7B FP8 text encoder
- Qwen Image VAE

Qwen Image Edit was selected for its strong instruction-based edits and Apache-2.0 license. The FP8
ComfyUI model is a better fit for a 16 GB GPU than the official Qwen-Image-Edit-2511 BF16 model.
Crop-and-Stitch limits generation to the selected area and preserves pixels outside the mask.

## Install

Close ComfyUI, then run:

```powershell
powershell -ExecutionPolicy Bypass -File scripts/setup-inpaint.ps1
```

The script installs the custom node and downloads the models into Comfy Desktop's shared model
directory. Downloads are resumable.

Restart ComfyUI after installation. Confirm that `InpaintCrop` and `InpaintStitch`-style nodes
appear in ComfyUI's node search before exporting the API-format inpaint workflow.

## Why an API Workflow Is Still Required

The web interface injects the uploaded image, rectangular mask, edit prompt, and generation settings
into a tested ComfyUI API-format workflow. Crop-and-Stitch has many context, resize, mask growth,
and blend controls. Keeping those choices in a ComfyUI workflow makes them inspectable and
replaceable without hard-coding a fragile graph in the frontend.
