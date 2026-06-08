# Contributing

Thanks for helping improve IdeaDraw.

## Local Setup

1. Install Node.js 20 or newer.
2. Run `npm install`.
3. Start ComfyUI with the nodes and models required by `api-workflow.json`.
4. Run `npm start`.
5. Open `http://localhost:4173`.

## Before Opening a Pull Request

- Keep the frontend dependency-free unless a dependency clearly reduces complexity.
- Preserve the normalized bounding-box JSON contract.
- Avoid committing generated output images, unrelated personal workflows, model files, or secrets.
  Project design references and the documented source workflow are intentional repository assets.
- Run `npm test`.
- Test generation, box editing, saved layouts, history, and refresh recovery.

## Workflow Changes

If a workflow change modifies node IDs consumed by the frontend, document the new IDs in `README.md`
and update `public/app.js` in the same pull request.
