#!/usr/bin/env python3
"""One-time migration of the original monolithic portfolio HTML.

The script deliberately uses only the Python standard library so the migration is
repeatable without adding a frontend dependency. It extracts every data URI,
parses each ``details.study`` through ``parseStudy`` and writes the ordered JSON
used by the public renderer.
"""

from __future__ import annotations

import base64
import html
import json
import re
from dataclasses import dataclass, field
from html.parser import HTMLParser
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
INDEX = ROOT / "index.html"


@dataclass
class Node:
    tag: str
    attrs: dict[str, str] = field(default_factory=dict)
    children: list["Node | str"] = field(default_factory=list)

    @property
    def classes(self) -> set[str]:
        return set(self.attrs.get("class", "").split())

    def text(self) -> str:
        value = "".join(child.text() if isinstance(child, Node) else child for child in self.children)
        return " ".join(value.split())

    def first(self, tag: str | None = None, cls: str | None = None) -> "Node | None":
        for child in self.children:
            if not isinstance(child, Node):
                continue
            if (tag is None or child.tag == tag) and (cls is None or cls in child.classes):
                return child
            found = child.first(tag, cls)
            if found:
                return found
        return None

    def all(self, tag: str | None = None, cls: str | None = None) -> list["Node"]:
        found: list[Node] = []
        for child in self.children:
            if not isinstance(child, Node):
                continue
            if (tag is None or child.tag == tag) and (cls is None or cls in child.classes):
                found.append(child)
            found.extend(child.all(tag, cls))
        return found


class TreeParser(HTMLParser):
    VOID = {"area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta", "param", "source", "track", "wbr", "path", "use"}

    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.root = Node("root")
        self.stack = [self.root]

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        node = Node(tag, {key: value or "" for key, value in attrs})
        self.stack[-1].children.append(node)
        if tag not in self.VOID:
            self.stack.append(node)

    def handle_startendtag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        node = Node(tag, {key: value or "" for key, value in attrs})
        self.stack[-1].children.append(node)

    def handle_endtag(self, tag: str) -> None:
        for pos in range(len(self.stack) - 1, 0, -1):
            if self.stack[pos].tag == tag:
                self.stack = self.stack[:pos]
                return

    def handle_data(self, data: str) -> None:
        self.stack[-1].children.append(data)


def direct_nodes(node: Node, tag: str | None = None, cls: str | None = None) -> list[Node]:
    return [
        child
        for child in node.children
        if isinstance(child, Node)
        and (tag is None or child.tag == tag)
        and (cls is None or cls in child.classes)
    ]


def parse_list(node: Node) -> list[str]:
    return [item.text() for item in direct_nodes(node, "li")]


def parseStudy(study: Node, categoria: int, image_route: str | None) -> dict:
    """Convert one legacy ``details.study`` node into the public data schema."""
    summary = study.first("summary")
    body = study.first("div", "body")
    detail = study.first("template", "detail")
    if not summary or not body or not detail:
        raise ValueError(f"Incomplete study markup: {study.attrs.get('id')}")

    tags = body.first("div", "tags")
    tiempos: list[str] = []
    etiquetas: list[str] = []
    if tags:
        for tag in direct_nodes(tags, "span", "tag"):
            (tiempos if "time" in tag.classes else etiquetas).append(tag.text())

    image = body.first("img")
    imagen = None
    if image and image_route:
        figure = body.first("figure", "thumb")
        imagen = {
            "ruta": image_route,
            "alt": image.attrs.get("alt", ""),
            "ajuste": "fit" if figure and "fit" in figure.classes else "cover",
        }

    intro = ""
    sections: list[dict] = []
    timeline: list[dict] = []
    facts: list[dict] = []
    current: dict | None = None

    for child in direct_nodes(detail):
        if child.tag == "h5":
            current = {"titulo": child.text(), "parrafo": "", "lista": [], "tipoLista": "ticks"}
            sections.append(current)
        elif child.tag == "p":
            if current is None and not intro:
                intro = child.text()
            elif current is not None and not current["parrafo"]:
                current["parrafo"] = child.text()
            else:
                # The current schema has one paragraph per section. Preserve an
                # unexpected extra paragraph as an unheaded section.
                current = {"titulo": "", "parrafo": child.text(), "lista": [], "tipoLista": "ticks"}
                sections.append(current)
        elif child.tag in {"ul", "ol"} and "timeline" not in child.classes:
            if current is None or current["lista"]:
                current = {"titulo": "", "parrafo": "", "lista": [], "tipoLista": "ticks"}
                sections.append(current)
            current["lista"] = parse_list(child)
            current["tipoLista"] = "steps" if "steps" in child.classes else "ticks"
        elif child.tag == "ol" and "timeline" in child.classes:
            for item in direct_nodes(child, "li"):
                duration = item.first("b")
                activity = item.first("span")
                timeline.append({
                    "duracion": duration.text() if duration else "",
                    "actividad": activity.text() if activity else "",
                })
        elif child.tag == "div" and "facts-row" in child.classes:
            for fact in direct_nodes(child, "div"):
                name = fact.first("span")
                value = fact.first("b")
                facts.append({
                    "nombre": name.text() if name else "",
                    "valor": value.text() if value else "",
                })

    title = summary.first("h4")
    tagline = summary.first("p", "tagline")
    return {
        "id": study.attrs["id"].removeprefix("estudio-"),
        "categoria": categoria,
        "nombre": title.text() if title else "",
        "frase": tagline.text() if tagline else "",
        "puntos": [item.text() for item in direct_nodes(body, "p")][:2],
        "tiempos": tiempos,
        "etiquetas": etiquetas,
        "imagen": imagen,
        "intro": intro,
        "secciones": sections,
        "cronograma": timeline,
        "datos": facts,
    }


def canonical(fragment: str) -> str:
    fragment = re.sub(r">\s+<", "><", fragment)
    fragment = re.sub(r"\s+", " ", fragment)
    return fragment.strip()


def main() -> None:
    source = INDEX.read_text(encoding="utf-8")
    media_names = [
        "assets/img/cover-poster.webp",
        "assets/img/studies-band.webp",
        "assets/img/cover-poster.webp",
        "assets/img/cover-poster.webp",
        "assets/video/cover.mp4",
        "assets/img/team-blob.webp",
        "assets/img/brand-film-poster.webp",
        "assets/img/map-blob.webp",
        "assets/img/map-dots.webp",
        "assets/img/panorama-banner.webp",
        "assets/img/team-photo.webp",
        "assets/estudios/bav.webp",
        "assets/estudios/brand-equity.webp",
        "assets/estudios/digital-explorer.webp",
        "assets/estudios/preview-starview.webp",
        "assets/estudios/territoryscan.webp",
        "assets/estudios/dashboard-competencia.webp",
        "assets/estudios/category-beat.webp",
        "assets/estudios/category-trend-decoder.webp",
        "assets/estudios/tendencias-mercado.webp",
        "assets/estudios/consumo-medios.webp",
        "assets/estudios/touchpoints.webp",
        "assets/estudios/tendencias-consumidor.webp",
        "assets/estudios/digital-brand-pulse.webp",
        "assets/img/cover-poster.webp",
        "assets/video/brand-film.mp4",
    ]
    data_pattern = re.compile(r"data:([^;,]+)(;base64)?,([^\"'\s<)]+)")
    matches = list(data_pattern.finditer(source))
    if len(matches) != len(media_names):
        raise RuntimeError(f"Expected {len(media_names)} data URIs, found {len(matches)}")

    replacements: list[tuple[int, int, str]] = []
    for match, relative in zip(matches, media_names, strict=True):
        target = ROOT / relative
        target.parent.mkdir(parents=True, exist_ok=True)
        payload = match.group(3)
        raw = base64.b64decode(payload) if match.group(2) else payload.encode()
        if not target.exists():
            target.write_bytes(raw)
        replacements.append((match.start(), match.end(), "/" + relative))

    for start, end, replacement in reversed(replacements):
        source = source[:start] + replacement + source[end:]

    parser = TreeParser()
    parser.feed(source)
    cols = [col for col in parser.root.all("div", "col") if col.first("details", "study")]
    studies: list[dict] = []
    image_by_id = {
        Path(path).stem: "/" + path
        for path in media_names
        if path.startswith("assets/estudios/")
    }
    for categoria, col in enumerate(cols):
        for study in col.all("details", "study"):
            study_id = study.attrs["id"].removeprefix("estudio-")
            studies.append(parseStudy(study, categoria, image_by_id.get(study_id)))

    if len(studies) != 16:
        raise RuntimeError(f"Expected 16 studies, parsed {len(studies)}")

    data_dir = ROOT / "data"
    data_dir.mkdir(exist_ok=True)
    (data_dir / "estudios.json").write_text(
        json.dumps(studies, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )

    # Snapshot after media extraction and before markup extraction. Tests use it
    # to prove the JSON renderer preserves each original details.study.
    fixtures = ROOT / "tests" / "fixtures"
    fixtures.mkdir(parents=True, exist_ok=True)
    study_fragments = re.findall(r"<details class=\"study\".*?</details>", source, re.S)
    (fixtures / "studies-before.json").write_text(
        json.dumps([canonical(item) for item in study_fragments], ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )

    source, removed = re.subn(r"\s*<details class=\"study\".*?</details>", "", source, flags=re.S)
    if removed != 16:
        raise RuntimeError(f"Expected to remove 16 study nodes, removed {removed}")

    INDEX.write_text(source, encoding="utf-8")
    print(f"Migrated {len(studies)} studies and {len(matches)} embedded media files")


if __name__ == "__main__":
    main()
