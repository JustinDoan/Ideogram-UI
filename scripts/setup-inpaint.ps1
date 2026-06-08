param(
  [string]$ComfyRoot = "$env:USERPROFILE\Documents\ComfyUI",
  [string]$SharedModels = "$env:USERPROFILE\ComfyUI-Shared\models"
)

$ErrorActionPreference = "Stop"

function Download-Model {
  param([string]$Url, [string]$Destination)

  New-Item -ItemType Directory -Force -Path (Split-Path $Destination) | Out-Null
  if (Test-Path $Destination) {
    Write-Host "Already present: $Destination"
    return
  }

  Write-Host "Downloading: $Destination"
  & curl.exe -L --fail --retry 5 --continue-at - --output $Destination $Url
  if ($LASTEXITCODE -ne 0) {
    throw "Download failed: $Url"
  }
}

$customNode = Join-Path $ComfyRoot "custom_nodes\ComfyUI-Inpaint-CropAndStitch"
if (-not (Test-Path $customNode)) {
  git clone https://github.com/lquesada/ComfyUI-Inpaint-CropAndStitch.git $customNode
} else {
  Write-Host "Already present: $customNode"
}

Download-Model `
  "https://huggingface.co/Comfy-Org/Qwen-Image-Edit_ComfyUI/resolve/main/split_files/diffusion_models/qwen_image_edit_2509_fp8_e4m3fn.safetensors" `
  (Join-Path $SharedModels "diffusion_models\qwen_image_edit_2509_fp8_e4m3fn.safetensors")

Download-Model `
  "https://huggingface.co/Comfy-Org/Qwen-Image_ComfyUI/resolve/main/split_files/text_encoders/qwen_2.5_vl_7b_fp8_scaled.safetensors" `
  (Join-Path $SharedModels "text_encoders\qwen_2.5_vl_7b_fp8_scaled.safetensors")

Download-Model `
  "https://huggingface.co/Comfy-Org/Qwen-Image_ComfyUI/resolve/main/split_files/vae/qwen_image_vae.safetensors" `
  (Join-Path $SharedModels "vae\qwen_image_vae.safetensors")

Write-Host ""
Write-Host "Inpaint dependencies installed. Restart ComfyUI before continuing."
