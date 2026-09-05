# Phisoft website

Static company website for Phisoft. The site uses plain HTML, Bootstrap and a shared design system in `assets/css/custom.css`.

## Local workflow

Run the complete build before publishing:

```sh
npm run build
```

The build synchronizes `components/header.html` and `components/footer.html` across every page, then validates local links, anchors, images, heading structure, structured data and sitemap coverage. No package installation is required.

Use `npm run validate` when checking files without regenerating shared layout.

## Editing shared layout

Edit the files in `components/`, then run `npm run build`. Do not edit generated page headers or footers directly because the next build replaces them.

Primary page styles use the `ai-page` shell. Page-specific classes add layouts for capabilities, solutions, careers, insights, case studies and engineering partnership.
