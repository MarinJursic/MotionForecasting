"""Render deterministic README evidence from the shipped scenario constants."""

from __future__ import annotations

from pathlib import Path
import sys

from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "docs" / "media"
OUT.mkdir(parents=True, exist_ok=True)
sys.path.insert(0, str(ROOT / "backend"))

from app.engine import forecast  # noqa: E402
from app.schemas import ForecastRequest, ObstructionMode  # noqa: E402

W, H = 1600, 1000
BG = "#06100e"
PANEL = "#0d1916"
PANEL2 = "#101e1a"
LINE = "#263b34"
TEXT = "#e9f0ec"
MUTED = "#81978f"
ACID = "#b8ff6a"
MINT = "#59ffcf"
BLUE = "#4cc9f0"
AMBER = "#ffd166"
DANGER = "#ff675e"


def font(size: int, bold: bool = False):
    candidates = [
        "/System/Library/Fonts/SFNSMono.ttf" if not bold else "/System/Library/Fonts/SFNSMonoBold.ttf",
        "/System/Library/Fonts/Supplemental/Arial.ttf",
    ]
    for path in candidates:
        try:
            return ImageFont.truetype(path, size)
        except OSError:
            continue
    return ImageFont.load_default()


def text(draw, xy, value, size, fill=TEXT, bold=False, anchor=None):
    draw.text(xy, value, font=font(size, bold), fill=fill, anchor=anchor)


def dashboard(obstruction: ObstructionMode, phase: float = 0) -> Image.Image:
    result = forecast(
        ForecastRequest(
            scenario_id="sf-market-0142",
            obstruction=obstruction,
            samples=128,
            seed=42,
        )
    )
    pedestrian = next(item for item in result.forecasts if item.actor_id == "ped-04")
    risk = round(result.risk.collision_probability * 100)
    visibility = round(result.risk.visibility * 100)
    ttc = result.risk.expected_ttc_s
    mode_values = [round(mode.probability * 100) for mode in pedestrian.modes]
    image = Image.new("RGB", (W, H), BG)
    draw = ImageDraw.Draw(image, "RGBA")
    draw.rectangle((0, 0, W, 70), fill=PANEL)
    draw.line((0, 70, W, 70), fill=LINE, width=1)
    text(draw, (34, 20), "///  VECTOR FIELD", 22, ACID, True)
    text(draw, (34, 47), "AUTONOMOUS MOTION FORECASTING LAB", 10, MUTED)
    text(draw, (620, 23), "STORY MODE", 11, ACID)
    text(draw, (620, 45), "SF–MARKET–0142  ·  URBAN / DUSK / OCCLUDED", 10, TEXT)
    text(draw, (1490, 34), "SEED 42 · 128 SAMPLES", 11, MINT, True, "ra")

    left, right, top, bottom = 260, 1320, 70, 840
    draw.rectangle((0, top, left, bottom), fill=PANEL)
    draw.rectangle((right, top, W, bottom), fill=PANEL)
    draw.rectangle((left, top, right, bottom), fill="#07110f")
    draw.line((left, top, left, bottom), fill=LINE)
    draw.line((right, top, right, bottom), fill=LINE)

    text(draw, (20, 98), "SCENE ACTORS", 11, MUTED)
    actors = [("ego-01", "Ego vehicle", TEXT), ("veh-27", "Vehicle", BLUE), ("ped-04", "Pedestrian", AMBER), ("cyc-09", "Cyclist", ACID)]
    for index, (actor, kind, color) in enumerate(actors):
        y = 132 + index * 68
        if actor == "ped-04":
            draw.rectangle((12, y - 10, 246, y + 47), fill="#15251d", outline="#6f9148")
        draw.ellipse((22, y + 2, 32, y + 12), fill=color)
        text(draw, (45, y), actor, 12, TEXT, True)
        text(draw, (45, y + 22), kind, 10, MUTED)
    text(draw, (20, 430), "VISUAL LAYERS", 11, MUTED)
    for index, label in enumerate(["Detections + points", "Probability tubes", "Occupancy + collision", "Visibility mask", "Observed tracks"]):
        y = 466 + index * 43
        text(draw, (22, y), label, 10, TEXT)
        draw.rounded_rectangle((205, y - 3, 236, y + 13), radius=8, fill="#203f30", outline="#6fa14b")
        draw.ellipse((220, y, 231, y + 11), fill=ACID)

    # road and city
    draw.rectangle((left, top, right, bottom), fill="#08120f")
    draw.polygon([(560, top), (795, top), (1035, bottom), (775, bottom)], fill="#192522")
    draw.polygon([(left, 380), (right, 270), (right, 500), (left, 615)], fill="#192522")
    for i in range(8):
        y = 105 + i * 92
        draw.rectangle((668 + i * 13, y, 684 + i * 13, y + 45), fill="#b9c3bb")
    for i in range(11):
        x = 320 + i * 96
        draw.polygon([(x, 474 - i * 8), (x + 50, 468 - i * 8), (x + 52, 480 - i * 8), (x + 2, 486 - i * 8)], fill="#9fa9a1")
    for box in [(285, 94, 500, 325), (995, 82, 1280, 258), (282, 640, 555, 815), (1070, 530, 1290, 816)]:
        draw.rectangle(box, fill="#12231e", outline="#244039")
        for wy in range(box[1] + 28, box[3] - 12, 42):
            draw.line((box[0] + 25, wy, box[2] - 25, wy), fill="#33584e", width=4)

    # risk heat map
    center = (765, 450)
    for radius, alpha, color in [(160, 20, AMBER), (120, 30, "#ff9a55"), (80, 45, DANGER), (42, 80, DANGER)]:
        draw.ellipse((center[0] - radius, center[1] - radius * .55, center[0] + radius, center[1] + radius * .55), fill=(*ImageColor_getrgb(color), alpha))

    # trajectories
    def poly(points, color, width):
        draw.line(points, fill=color, width=width, joint="curve")
    poly([(707, 760), (720, 640), (735, 530), (770, 420)], MINT, 13)
    poly([(940, 330), (865, 370), (790, 430), (720, 500)], AMBER, 17)
    poly([(940, 330), (990, 400), (1060, 450)], (255, 209, 102, 100), 9)
    poly([(370, 510), (540, 480), (730, 450), (910, 410)], BLUE, 12)
    poly([(870, 180), (830, 310), (790, 430), (760, 570)], ACID, 10)

    # actors
    draw.rounded_rectangle((694, 632, 758, 706), radius=10, fill=TEXT, outline="#ffffff")
    draw.rounded_rectangle((502, 450, 578, 491), radius=8, fill=BLUE)
    van_xy = {"present": (834, 343, 905, 435), "shifted": (950, 255, 1045, 320), "removed": None}[obstruction]
    if van_xy:
        draw.rounded_rectangle(van_xy, radius=8, fill="#e8b65d", outline="#fff0b9")
    draw.ellipse((936, 337, 953, 354), fill=AMBER, outline="#fff2bf")
    draw.ellipse((810, 240, 829, 259), fill=ACID)

    # callout
    draw.ellipse((741, 426, 789, 474), outline=DANGER, width=3)
    draw.line((730, 450, 800, 450), fill=DANGER, width=2)
    draw.line((765, 415, 765, 485), fill=DANGER, width=2)
    draw.rectangle((800, 418, 982, 482), fill="#130e0ddd", outline=DANGER)
    text(draw, (814, 430), "PEDESTRIAN CONFLICT", 9, MUTED)
    text(draw, (814, 451), f"{risk}% RISK   ·   TTC {ttc:.1f}s", 13, DANGER, True)

    # right details
    text(draw, (1345, 100), "SELECTED ACTOR", 11, MUTED)
    draw.ellipse((1348, 132, 1390, 174), fill=AMBER)
    text(draw, (1408, 132), "Pedestrian", 14, TEXT, True)
    text(draw, (1408, 155), "ped-04  ·  1.4 m/s", 10, MUTED)
    text(draw, (1345, 220), "UNCERTAINTY", 9, MUTED)
    text(draw, (1345, 244), f"{pedestrian.entropy:.2f} entropy", 15, TEXT)
    text(draw, (1480, 220), "VISIBILITY", 9, MUTED)
    text(draw, (1480, 244), f"{visibility}%", 15, AMBER if visibility < 50 else MINT, True)
    text(draw, (1345, 308), "FUTURE MODES", 10, MUTED)
    for index, (label, value, color) in enumerate(zip(("Continue", "Yield", "Deviate"), mode_values, (AMBER, MINT, "#b38cff"), strict=True)):
        y = 344 + index * 46
        text(draw, (1345, y), label, 10, TEXT)
        draw.rectangle((1430, y + 3, 1550, y + 8), fill="#203029")
        draw.rectangle((1430, y + 3, 1430 + value * 1.2, y + 8), fill=color)
        text(draw, (1570, y), f"{value/100:.2f}", 9, MUTED, anchor="ra")
    text(draw, (1345, 515), "COLLISION LIKELIHOOD", 9, MUTED)
    draw.ellipse((1345, 545, 1445, 645), outline=LINE, width=9)
    draw.arc((1345, 545, 1445, 645), -90, -90 + risk * 3.6, fill=DANGER, width=9)
    text(draw, (1395, 582), str(risk), 24, TEXT, True, "mm")
    text(draw, (1470, 570), "WATCH" if risk > 60 else "MODERATE" if risk > 30 else "LOW", 14, DANGER if risk > 60 else MINT, True)
    text(draw, (1470, 598), "synthetic conflict model", 9, MUTED)
    draw.rectangle((1342, 690, 1578, 758), fill="#15251d", outline="#6f9148")
    text(draw, (1360, 709), "RUN COUNTERFACTUAL", 12, ACID, True)
    text(draw, (1360, 734), "Move or remove obstruction  →", 9, MUTED)

    # timeline and evidence
    draw.rectangle((285, 772, 1295, 822), fill="#091512dd", outline=LINE)
    text(draw, (308, 790), "Ⅱ   00:06.2", 12, ACID)
    draw.line((455, 797, 1160, 797), fill="#41524c", width=3)
    draw.line((455, 797, 455 + int(phase * 705), 797), fill=ACID, width=3)
    draw.ellipse((450 + int(phase * 705), 791, 462 + int(phase * 705), 803), fill=ACID)
    text(draw, (1210, 790), "1×", 10, TEXT)
    draw.rectangle((0, 840, W, H), fill="#091411")
    text(draw, (26, 875), "SYNTHETIC EVAL FIXTURE", 10, ACID)
    text(draw, (26, 902), "Accuracy · calibration\n· latency", 16, TEXT, True)
    metrics = [("GRAPH DIFFUSION", "0.82m", "6.2%", "0.041", ACID), ("SCENE TRANSFORMER", "0.94m", "8.5%", "0.068", MUTED), ("CONSTANT VELOCITY", "1.73m", "18.1%", "0.142", MUTED)]
    for index, (name, ade, miss, ece, color) in enumerate(metrics):
        x = 300 + index * 320
        draw.line((x, 840, x, H), fill=LINE)
        text(draw, (x + 22, 866), name, 11, color, True)
        text(draw, (x + 22, 907), "minADE ↓", 8, MUTED)
        text(draw, (x + 22, 929), ade, 13, TEXT)
        text(draw, (x + 120, 907), "MISS ↓", 8, MUTED)
        text(draw, (x + 120, 929), miss, 13, TEXT)
        text(draw, (x + 215, 907), "ECE ↓", 8, MUTED)
        text(draw, (x + 215, 929), ece, 13, TEXT)
    text(draw, (1300, 875), "OOD SCORE", 9, MUTED)
    text(draw, (1300, 906), f"{pedestrian.ood_score:.2f}", 26, TEXT, True)
    text(draw, (1300, 944), "ELEVATED" if pedestrian.ood_score > 0.3 else "IN RANGE", 10, AMBER if pedestrian.ood_score > 0.3 else MINT)
    return image


def ImageColor_getrgb(value: str) -> tuple[int, int, int]:
    value = value.lstrip("#")
    return tuple(int(value[i : i + 2], 16) for i in (0, 2, 4))


overview = dashboard("present", 0.52)
overview.save(OUT / "vector-field-overview.png", optimize=True)

frames = []
for index in range(15):
    if index < 5:
        mode = "present"
    elif index < 10:
        mode = "shifted"
    else:
        mode = "removed"
    frame = dashboard(mode, index / 14)
    banner = ImageDraw.Draw(frame, "RGBA")
    banner.rectangle((500, 82, 1100, 128), fill="#07110fe6", outline=ACID)
    label = {"present": "BASELINE · VAN PRESENT", "shifted": "COUNTERFACTUAL · SHIFTED 8M", "removed": "COUNTERFACTUAL · OBSTRUCTION REMOVED"}[mode]
    text(banner, (800, 105), label, 14, ACID, True, "mm")
    frames.append(frame.resize((960, 600), Image.Resampling.LANCZOS, reducing_gap=3))
frames[0].save(
    OUT / "hidden-pedestrian-counterfactual.gif",
    save_all=True,
    append_images=frames[1:],
    duration=180,
    loop=0,
    optimize=True,
)
print(OUT / "vector-field-overview.png")
print(OUT / "hidden-pedestrian-counterfactual.gif")
