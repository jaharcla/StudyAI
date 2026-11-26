import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import AdmZip from "adm-zip";
import type { PresentonGenerateRequest } from "./compile";
import type { RenderedDeck } from "./renderer";

/**
 * Deterministic, local PPTX writer. It compiles already-grounded slide text into
 * an editable Office package: real text shapes, no external service and no model
 * call. Nothing here invents content; every line comes from the compiled deck.
 */

const A = "http://schemas.openxmlformats.org/drawingml/2006/main";
const R = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";
const P = "http://schemas.openxmlformats.org/presentationml/2006/main";
const REL = "http://schemas.openxmlformats.org/package/2006/relationships";
const CT = "http://schemas.openxmlformats.org/package/2006/content-types";
const CORE = "http://schemas.openxmlformats.org/package/2006/metadata/core-properties";
const DC = "http://purl.org/dc/elements/1.1/";
const DCTERMS = "http://purl.org/dc/terms/";
const XSI = "http://www.w3.org/2001/XMLSchema-instance";
const APP = "http://schemas.openxmlformats.org/officeDocument/2006/extended-properties";

function escapeXml(value: string): string {
  return value
    // XML 1.0 excludes these control characters; strip them before escaping.
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

type ParsedSlide = { title: string; body: string };

function parseSlide(markdown: string, index: number): ParsedSlide {
  const lines = markdown.split(/\r?\n/);
  let title = "";
  const body: string[] = [];
  for (const line of lines) {
    if (!title && /^#\s+/.test(line)) {
      title = line.replace(/^#\s+/, "").trim();
      continue;
    }
    if (line.trim()) body.push(line.trim());
  }
  // The leading newline keeps the first body claim on its own line when the
  // document extractor joins text runs, so "> Source:" lines stay detectable.
  return { title: title || `Slide ${index + 1}`, body: body.length ? `\n${body.join("\n")}` : "" };
}

function textShape(id: number, name: string, text: string, x: number, y: number, cx: number, cy: number, size: number, bold: boolean): string {
  return `<p:sp>`
    + `<p:nvSpPr><p:cNvPr id="${id}" name="${escapeXml(name)}"/><p:cNvSpPr txBox="1"/><p:nvPr/></p:nvSpPr>`
    + `<p:spPr><a:xfrm><a:off x="${x}" y="${y}"/><a:ext cx="${cx}" cy="${cy}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom><a:noFill/></p:spPr>`
    + `<p:txBody><a:bodyPr wrap="square" anchor="t"/><a:lstStyle/><a:p><a:r>`
    + `<a:rPr lang="en-US" sz="${size}"${bold ? ' b="1"' : ""} dirty="0"/>`
    + `<a:t xml:space="preserve">${escapeXml(text)}</a:t></a:r></a:p></p:txBody>`
    + `</p:sp>`;
}

function slideXml(slide: ParsedSlide): string {
  const shapes = textShape(2, "Title", slide.title, 457200, 274638, 8229600, 900000, 2800, true)
    + (slide.body ? textShape(3, "Body", slide.body, 457200, 1280160, 8229600, 3600000, 1800, false) : "");
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>`
    + `<p:sld xmlns:a="${A}" xmlns:r="${R}" xmlns:p="${P}"><p:cSld><p:spTree>`
    + `<p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr>`
    + `<p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr>`
    + shapes
    + `</p:spTree></p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sld>`;
}

const GROUP = `<p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr>`
  + `<p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr>`;

function themeXml(): string {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>`
    + `<a:theme xmlns:a="${A}" name="StudyAI"><a:themeElements>`
    + `<a:clrScheme name="StudyAI">`
    + `<a:dk1><a:sysClr val="windowText" lastClr="000000"/></a:dk1><a:lt1><a:sysClr val="window" lastClr="FFFFFF"/></a:lt1>`
    + `<a:dk2><a:srgbClr val="1F2937"/></a:dk2><a:lt2><a:srgbClr val="F9FAFB"/></a:lt2>`
    + `<a:accent1><a:srgbClr val="2563EB"/></a:accent1><a:accent2><a:srgbClr val="7C3AED"/></a:accent2>`
    + `<a:accent3><a:srgbClr val="0D9488"/></a:accent3><a:accent4><a:srgbClr val="F59E0B"/></a:accent4>`
    + `<a:accent5><a:srgbClr val="EF4444"/></a:accent5><a:accent6><a:srgbClr val="10B981"/></a:accent6>`
    + `<a:hlink><a:srgbClr val="0563C1"/></a:hlink><a:folHlink><a:srgbClr val="954F72"/></a:folHlink>`
    + `</a:clrScheme>`
    + `<a:fontScheme name="StudyAI"><a:majorFont><a:latin typeface="Aptos Display"/><a:ea typeface=""/><a:cs typeface=""/></a:majorFont>`
    + `<a:minorFont><a:latin typeface="Aptos"/><a:ea typeface=""/><a:cs typeface=""/></a:minorFont></a:fontScheme>`
    + `<a:fmtScheme name="StudyAI"><a:fillStyleLst><a:solidFill><a:schemeClr val="phClr"/></a:solidFill>`
    + `<a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:fillStyleLst>`
    + `<a:lnStyleLst><a:ln w="9525"><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:ln>`
    + `<a:ln w="9525"><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:ln>`
    + `<a:ln w="9525"><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:ln></a:lnStyleLst>`
    + `<a:effectStyleLst><a:effectStyle><a:effectLst/></a:effectStyle><a:effectStyle><a:effectLst/></a:effectStyle>`
    + `<a:effectStyle><a:effectLst/></a:effectStyle></a:effectStyleLst>`
    + `<a:bgFillStyleLst><a:solidFill><a:schemeClr val="phClr"/></a:solidFill>`
    + `<a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:bgFillStyleLst>`
    + `</a:fmtScheme></a:themeElements></a:theme>`;
}

function masterXml(): string {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>`
    + `<p:sldMaster xmlns:a="${A}" xmlns:r="${R}" xmlns:p="${P}"><p:cSld>`
    + `<p:bg><p:bgPr><a:solidFill><a:schemeClr val="bg1"/></a:solidFill><a:effectLst/></p:bgPr></p:bg>`
    + `<p:spTree>${GROUP}</p:spTree></p:cSld>`
    + `<p:clrMap accent1="accent1" accent2="accent2" accent3="accent3" accent4="accent4" accent5="accent5" accent6="accent6" bg1="lt1" bg2="lt2" folHlink="folHlink" hlink="hlink" tx1="dk1" tx2="dk2"/>`
    + `<p:sldLayoutIdLst><p:sldLayoutId id="2147483649" r:id="rId1"/></p:sldLayoutIdLst>`
    + `<p:txStyles><p:titleStyle><a:lvl1pPr algn="l"><a:defRPr sz="2800"/></a:lvl1pPr></p:titleStyle>`
    + `<p:bodyStyle><a:lvl1pPr><a:defRPr sz="1800"/></a:lvl1pPr></p:bodyStyle><p:otherStyle/></p:txStyles>`
    + `</p:sldMaster>`;
}

function layoutXml(): string {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>`
    + `<p:sldLayout xmlns:a="${A}" xmlns:r="${R}" xmlns:p="${P}" type="blank" preserve="1">`
    + `<p:cSld name="Blank"><p:spTree>${GROUP}</p:spTree></p:cSld>`
    + `<p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sldLayout>`;
}

export type LocalRendererDeps = { outputDir: string };

export async function renderLocalDeck(request: PresentonGenerateRequest, deps: LocalRendererDeps): Promise<RenderedDeck> {
  const slides = (request.slides_markdown.length ? request.slides_markdown : ["# Study deck"]).map(parseSlide);
  const id = randomUUID();
  const zip = new AdmZip();

  const overrides = slides.map((_, index) => `<Override PartName="/ppt/slides/slide${index + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slide+xml"/>`).join("");
  zip.addFile("[Content_Types].xml", Buffer.from(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>`
    + `<Types xmlns="${CT}"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>`
    + `<Default Extension="xml" ContentType="application/xml"/>`
    + `<Override PartName="/ppt/presentation.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml"/>`
    + `<Override PartName="/ppt/slideMasters/slideMaster1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slideMaster+xml"/>`
    + `<Override PartName="/ppt/slideLayouts/slideLayout1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slideLayout+xml"/>`
    + `<Override PartName="/ppt/theme/theme1.xml" ContentType="application/vnd.openxmlformats-officedocument.theme+xml"/>`
    + `<Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>`
    + `<Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/>`
    + `${overrides}</Types>`));

  zip.addFile("_rels/.rels", Buffer.from(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>`
    + `<Relationships xmlns="${REL}">`
    + `<Relationship Id="rId1" Type="${R}/officeDocument" Target="ppt/presentation.xml"/>`
    + `<Relationship Id="rId2" Type="${CORE}" Target="docProps/core.xml"/>`
    + `<Relationship Id="rId3" Type="${R}/extended-properties" Target="docProps/app.xml"/>`
    + `</Relationships>`));

  const now = new Date().toISOString().replace(/\.\d+Z$/, "Z");
  zip.addFile("docProps/core.xml", Buffer.from(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>`
    + `<cp:coreProperties xmlns:cp="${CORE}" xmlns:dc="${DC}" xmlns:dcterms="${DCTERMS}" xmlns:xsi="${XSI}">`
    + `<dc:title>${escapeXml(slides[0]?.title ?? "Study deck")}</dc:title><dc:creator>StudyAI</dc:creator>`
    + `<dcterms:created xsi:type="dcterms:W3CDTF">${now}</dcterms:created></cp:coreProperties>`));
  zip.addFile("docProps/app.xml", Buffer.from(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>`
    + `<Properties xmlns="${APP}"><Application>StudyAI</Application><Slides>${slides.length}</Slides></Properties>`));

  const sldIds = slides.map((_, index) => `<p:sldId id="${256 + index}" r:id="rId${index + 2}"/>`).join("");
  zip.addFile("ppt/presentation.xml", Buffer.from(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>`
    + `<p:presentation xmlns:a="${A}" xmlns:r="${R}" xmlns:p="${P}">`
    + `<p:sldMasterIdLst><p:sldMasterId id="2147483648" r:id="rId1"/></p:sldMasterIdLst>`
    + `<p:sldIdLst>${sldIds}</p:sldIdLst>`
    + `<p:sldSz cx="9144000" cy="5143500" type="screen16x9"/><p:notesSz cx="6858000" cy="9144000"/>`
    + `</p:presentation>`));

  const slideRels = slides.map((_, index) => `<Relationship Id="rId${index + 2}" Type="${R}/slide" Target="slides/slide${index + 1}.xml"/>`).join("");
  zip.addFile("ppt/_rels/presentation.xml.rels", Buffer.from(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>`
    + `<Relationships xmlns="${REL}"><Relationship Id="rId1" Type="${R}/slideMaster" Target="slideMasters/slideMaster1.xml"/>`
    + `${slideRels}<Relationship Id="rId${slides.length + 2}" Type="${R}/theme" Target="theme/theme1.xml"/></Relationships>`));

  zip.addFile("ppt/slideMasters/slideMaster1.xml", Buffer.from(masterXml()));
  zip.addFile("ppt/slideMasters/_rels/slideMaster1.xml.rels", Buffer.from(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>`
    + `<Relationships xmlns="${REL}"><Relationship Id="rId1" Type="${R}/theme" Target="../theme/theme1.xml"/>`
    + `<Relationship Id="rId2" Type="${R}/slideLayout" Target="../slideLayouts/slideLayout1.xml"/></Relationships>`));
  zip.addFile("ppt/slideLayouts/slideLayout1.xml", Buffer.from(layoutXml()));
  zip.addFile("ppt/slideLayouts/_rels/slideLayout1.xml.rels", Buffer.from(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>`
    + `<Relationships xmlns="${REL}"><Relationship Id="rId1" Type="${R}/slideMaster" Target="../slideMasters/slideMaster1.xml"/></Relationships>`));
  zip.addFile("ppt/theme/theme1.xml", Buffer.from(themeXml()));

  slides.forEach((slide, index) => {
    const n = index + 1;
    zip.addFile(`ppt/slides/slide${n}.xml`, Buffer.from(slideXml(slide)));
    zip.addFile(`ppt/slides/_rels/slide${n}.xml.rels`, Buffer.from(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>`
      + `<Relationships xmlns="${REL}"><Relationship Id="rId1" Type="${R}/slideLayout" Target="../slideLayouts/slideLayout1.xml"/></Relationships>`));
  });

  const file = `${id}/deck.pptx`;
  const target = path.join(deps.outputDir, file);
  await mkdir(path.dirname(target), { recursive: true });
  await writeFile(target, zip.toBuffer());
  return { presentationId: id, pptxPath: file, editPath: "" };
}
