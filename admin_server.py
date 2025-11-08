import json
import os
import re
import sqlite3
from pathlib import Path

from flask import (
    Flask,
    abort,
    flash,
    jsonify,
    redirect,
    render_template,
    request,
    url_for,
)

BASE_DIR = Path(__file__).resolve().parent
SNAPSHOT_JSON = BASE_DIR / "portal_data.json"
DATA_DIR = Path(os.environ.get("PORTAL_DATA_DIR", BASE_DIR / "data"))
DB_PATH = DATA_DIR / "pages.db"

SLUG_PATTERN = re.compile(r"^[a-z0-9-]{1,48}$")
SECTION_VARIANTS = ("text_plain", "text_titled", "cards_horizontal", "cards_vertical")


def get_conn():
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def export_snapshot():
    pages = list_pages(include_data=True)
    snapshot = {"pages": {page["slug"]: {"title": page["title"], "data": page["data"]} for page in pages}}
    SNAPSHOT_JSON.write_text(json.dumps(snapshot, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def load_default_payload():
    if SNAPSHOT_JSON.exists():
        with SNAPSHOT_JSON.open(encoding="utf-8") as f:
            snapshot = json.load(f)
        if isinstance(snapshot, dict):
            if "pages" in snapshot and snapshot["pages"]:
                return next(iter(snapshot["pages"].values()))["data"]
            return snapshot
    return {
        "meta": {
            "sectionLabel": "Tools Portal",
            "adminLink": "http://localhost:5000/admin",
        },
        "hero": default_hero("工具面板"),
        "sections": [],
        "footer": "",
    }


def migrate_legacy_sections(payload):
    if "sections" in payload:
        return payload

    sections = []
    services = payload.get("services") or []
    if services:
        cards = []
        for svc in services:
            cards.append(
                {
                    "title": svc.get("title", ""),
                    "status": svc.get("status", ""),
                    "content": svc.get("description", ""),
                    "meta": svc.get("meta") or [],
                    "linkLabel": svc.get("linkLabel", ""),
                    "linkUrl": svc.get("linkUrl", ""),
                }
            )
        sections.append(
            {
                "type": "cards_horizontal",
                "heading": payload.get("meta", {}).get("sectionLabel", "服务面板"),
                "cards": cards,
            }
        )

    quick = payload.get("quick") or {}
    quick_cards = []
    if quick.get("firstUse"):
        quick_cards.append(
            {
                "title": quick.get("firstUseTitle", "第一次使用"),
                "status": "",
                "content": "\n".join(quick.get("firstUse", [])),
                "meta": [],
                "linkLabel": "",
                "linkUrl": "",
            }
        )
    if quick.get("issues"):
        quick_cards.append(
            {
                "title": quick.get("issuesTitle", "遇到故障"),
                "status": "",
                "content": "\n".join(quick.get("issues", [])),
                "meta": [],
                "linkLabel": "",
                "linkUrl": "",
            }
        )
    if quick_cards:
        sections.append(
            {
                "type": "cards_vertical",
                "heading": quick.get("title", "速查"),
                "cards": quick_cards,
            }
        )

    payload["sections"] = sections
    payload.pop("services", None)
    payload.pop("quick", None)
    return payload


def ensure_db():
    conn = get_conn()
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS pages (
            slug TEXT PRIMARY KEY,
            title TEXT NOT NULL,
            data TEXT NOT NULL
        )
        """
    )

    count = conn.execute("SELECT COUNT(*) FROM pages").fetchone()[0]
    if count == 0:
        payload = migrate_legacy_sections(load_default_payload())
        conn.execute(
            "INSERT INTO pages (slug, title, data) VALUES (?, ?, ?)",
            ("home", "主页", json.dumps(payload, ensure_ascii=False, indent=2)),
        )
        conn.commit()
        export_snapshot()
    conn.close()


def list_pages(include_data=False):
    ensure_db()
    conn = get_conn()
    rows = conn.execute("SELECT slug, title, data FROM pages ORDER BY title").fetchall()
    conn.close()
    result = []
    for row in rows:
        entry = {"slug": row["slug"], "title": row["title"]}
        if include_data:
            entry["data"] = json.loads(row["data"])
        result.append(entry)
    return result


def get_page(slug):
    ensure_db()
    conn = get_conn()
    row = conn.execute("SELECT slug, title, data FROM pages WHERE slug=?", (slug,)).fetchone()
    conn.close()
    if not row:
        return None
    return {
        "slug": row["slug"],
        "title": row["title"],
        "data": json.loads(row["data"]),
    }


def save_page(slug, title, data):
    ensure_db()
    payload = json.dumps(data, ensure_ascii=False, indent=2)
    conn = get_conn()
    conn.execute(
        "INSERT INTO pages (slug, title, data) VALUES (?, ?, ?)"
        " ON CONFLICT(slug) DO UPDATE SET title=excluded.title, data=excluded.data",
        (slug, title, payload),
    )
    conn.commit()
    conn.close()
    export_snapshot()


def create_page(slug, title):
    if not SLUG_PATTERN.match(slug):
        raise ValueError("Slug 仅能包含小写字母、数字或连字符，且长度不超过 48。")
    if get_page(slug):
        raise ValueError("该 Slug 已存在。")
    display_title = title or slug
    save_page(slug, display_title, new_page_payload(display_title or "新建页面"))


def delete_page(slug):
    pages = list_pages()
    if len(pages) <= 1:
        raise ValueError("至少需要保留一个页面。")
    conn = get_conn()
    conn.execute("DELETE FROM pages WHERE slug=?", (slug,))
    conn.commit()
    conn.close()
    export_snapshot()


def split_lines(value):
    return [line.strip() for line in (value or "").splitlines() if line.strip()]


def default_card():
    return {
        "title": "",
        "status": "",
        "content": "",
        "meta": [],
        "linkLabel": "",
        "linkUrl": "",
    }


def default_hero(title="新建页面", description=""):
    return {"title": title, "description": description, "chips": []}


def default_section(variant="text_plain"):
    variant = variant if variant in SECTION_VARIANTS else "text_plain"
    section = {"type": variant, "heading": ""}
    if variant.startswith("text"):
        section["content"] = ""
    else:
        section["cards"] = [default_card()]
    return section


def parse_sections(form):
    sections = []
    section_count = int(form.get("section_count", 0))
    for idx in range(section_count):
        prefix = f"sections-{idx}-"
        variant = form.get(prefix + "variant", "text_plain")
        heading = form.get(prefix + "heading", "").strip()
        if variant.startswith("text"):
            sections.append(
                {
                    "type": variant,
                    "heading": heading,
                    "content": form.get(prefix + "content", "").strip(),
                }
            )
        else:
            card_count = int(form.get(prefix + "card_count", 0))
            cards = []
            for card_idx in range(card_count):
                card_prefix = f"{prefix}cards-{card_idx}-"
                cards.append(
                    {
                        "title": form.get(card_prefix + "title", "").strip(),
                        "status": form.get(card_prefix + "status", "").strip(),
                        "content": form.get(card_prefix + "content", "").strip(),
                        "meta": split_lines(form.get(card_prefix + "meta", "")),
                        "linkLabel": form.get(card_prefix + "link_label", "").strip(),
                        "linkUrl": form.get(card_prefix + "link_url", "").strip(),
                    }
                )
            sections.append({"type": variant, "heading": heading, "cards": cards})
    return sections


def new_page_payload(title="新建页面"):
    return {
        "meta": {
            "sectionLabel": "页面说明",
            "adminLink": "http://localhost:5000/admin",
        },
        "hero": default_hero(title),
        "sections": [],
        "footer": "",
    }


def parse_form(form):
    hero_present = form.get("hero_present") == "1"
    hero_data = None
    if hero_present:
        hero_data = {
            "title": form.get("hero_title", "").strip(),
            "description": form.get("hero_description", "").strip(),
            "chips": split_lines(form.get("hero_chips", "")),
        }

    return {
        "meta": {
            "sectionLabel": form.get("section_label", "").strip(),
            "adminLink": form.get("admin_link", "").strip() or "http://localhost:5000/admin",
        },
        "hero": hero_data,
        "sections": parse_sections(form),
        "footer": form.get("footer", "").strip(),
    }


HTML_DIR = BASE_DIR / "html"
app = Flask(
    __name__,
    static_folder=str(HTML_DIR),
    template_folder=str(HTML_DIR),
    static_url_path="",
)
app.secret_key = "trevor-portal-admin"


@app.route("/")
def root():
    return app.send_static_file("index.html")


@app.route("/p/<slug>")
def page_entry(slug):
    return app.send_static_file("index.html")


@app.get("/api/pages")
def api_pages():
    return jsonify(list_pages())


@app.get("/api/pages/<slug>.json")
def api_page(slug):
    page = get_page(slug)
    if not page:
        abort(404)
    payload = page["data"]
    payload["pageTitle"] = page["title"]
    return jsonify(payload)


def current_page_or_default(slug):
    pages = list_pages()
    if slug and any(p["slug"] == slug for p in pages):
        return slug, pages
    return (pages[0]["slug"] if pages else "home"), pages


@app.route("/admin", methods=["GET", "POST"])
def admin():
    requested_slug = request.args.get("slug") or request.form.get("page_slug")
    slug, pages = current_page_or_default(requested_slug)

    if request.method == "POST":
        action = request.form.get("action", "save")

        if action == "create_page":
            new_slug = (request.form.get("new_page_slug") or "").strip().lower()
            new_title = (request.form.get("new_page_title") or "").strip() or new_slug
            try:
                create_page(new_slug, new_title)
                flash("新页面已创建。", "success")
                return redirect(url_for("admin", slug=new_slug))
            except ValueError as exc:
                flash(str(exc), "info")
                return redirect(url_for("admin", slug=slug))

        if action == "delete_page":
            target = request.form.get("target_page_slug")
            try:
                delete_page(target)
                flash("页面已删除。", "info")
            except ValueError as exc:
                flash(str(exc), "info")
                return redirect(url_for("admin", slug=slug))
            new_slug = current_page_or_default(None)[0]
            return redirect(url_for("admin", slug=new_slug))

        page_title = (request.form.get("page_title") or "").strip() or slug
        form_data = parse_form(request.form)

        if action == "add_section":
            form_data["sections"].append(default_section("text_plain"))
            return render_template(
                "admin.html",
                data=form_data,
                pages=pages,
                current_slug=slug,
                page_title=page_title,
            )

        if action == "delete_hero":
            form_data["hero"] = None
            flash("标题区块已移除。", "info")
            return render_template(
                "admin.html",
                data=form_data,
                pages=pages,
                current_slug=slug,
                page_title=page_title,
            )

        if action == "restore_hero":
            form_data["hero"] = default_hero("新建页面")
            flash("已添加标题区块。", "info")
            return render_template(
                "admin.html",
                data=form_data,
                pages=pages,
                current_slug=slug,
                page_title=page_title,
            )

        if action.startswith("delete_section_"):
            try:
                idx = int(action.rsplit("_", 1)[-1])
                if 0 <= idx < len(form_data["sections"]):
                    form_data["sections"].pop(idx)
            except ValueError:
                pass
            return render_template(
                "admin.html",
                data=form_data,
                pages=pages,
                current_slug=slug,
                page_title=page_title,
            )

        if action.startswith("add_card_"):
            try:
                idx = int(action.rsplit("_", 1)[-1])
                section = form_data["sections"][idx]
                if section["type"].startswith("cards"):
                    section.setdefault("cards", []).append(default_card())
            except (ValueError, IndexError):
                pass
            return render_template(
                "admin.html",
                data=form_data,
                pages=pages,
                current_slug=slug,
                page_title=page_title,
            )

        if action.startswith("delete_card_"):
            try:
                _, sec_idx, card_idx = action.split("_")
                sec_idx = int(sec_idx)
                card_idx = int(card_idx)
                section = form_data["sections"][sec_idx]
                if section["type"].startswith("cards") and 0 <= card_idx < len(section.get("cards", [])):
                    section["cards"].pop(card_idx)
            except (ValueError, IndexError):
                pass
            return render_template(
                "admin.html",
                data=form_data,
                pages=pages,
                current_slug=slug,
                page_title=page_title,
            )

        save_page(slug, page_title, form_data)
        flash("改动已保存。", "success")
        return redirect(url_for("admin", slug=slug))

    page = get_page(slug)
    if not page:
        abort(404)
    return render_template(
        "admin.html",
        data=page["data"],
        pages=pages,
        current_slug=slug,
        page_title=page["title"],
    )


if __name__ == "__main__":
    app.run(debug=True)
