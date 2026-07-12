/* ============================================================
 * HOME — G3「整線 / SEISEN」デザイン
 * docs/homepage-redesign/variant-g3.html からの移植。
 * - ヒーロー: Canvas ケーブルラック描画 + 結束の一拍ロード演出
 * - 転: 同心円90°ベンド pinned シーン（BEND_ROTATE=8）
 * - 承: 垂直幹線 SVG + 分岐 + 通電グローヘッド（scrub）
 * - 結: 端子台4拍フィナーレ pinned シーン
 * 既存 Layout（Header/Footer/言語切替）の内側に .g3 スコープで描画。
 * ============================================================ */
import { useEffect, useRef } from "react";
import type { CSSProperties, ReactNode } from "react";
import { Link } from "wouter";
import { useLanguage } from "@/contexts/LanguageContext";
import { usePageSEO } from "@/hooks/usePageSEO";
import { EMAIL, PHONE, INSTAGRAM_URL, LINEWORKS_URL } from "@/lib/translations";
import Layout from "@/components/Layout";
import "./home-seisen.css";

/** 同心円ベンドのカメラ回転量(deg)。90度比較ビルドはこの1箇所のみ変更する */
const BEND_ROTATE = 8;

/** 起「結束の一拍」ロード演出はセッション中1回のみ（言語切替等での再実行時はスキップ） */
let introPlayed = false;

const accent = (v: string) => ({ "--c": v }) as CSSProperties;

/* ============================================================
 * G3 エンジン（モックアップの <script> を移植）
 * rootEl(.g3) 基準のローカル座標系で全ジオメトリを扱う。
 * 戻り値はクリーンアップ関数（rAF/listener/observer 全解除）。
 * ============================================================ */
type Col = { base: string; dark: string; d2: string; lite: string };

function startG3(rootEl: HTMLDivElement, bendNoteText: string): () => void {
  const doc = document;
  const docEl = doc.documentElement;
  const RM = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const FINE = matchMedia("(pointer: fine)").matches;
  const q = <T extends Element>(sel: string) => rootEl.querySelector(sel) as T;

  const hero = q<HTMLElement>("#hero");
  const cv = q<HTMLCanvasElement>("#cv");
  const ctx = cv.getContext("2d");
  const ov = q<SVGSVGElement>("#ov");
  const bendSvg = q<SVGSVGElement>("#bendsvg");
  const bendCam = q<HTMLElement>(".bend-cam");
  const termSvg = q<SVGSVGElement>("#termsvg");
  const finEl = q<HTMLElement>("#fin");
  const termcta = q<HTMLElement>("#termcta");
  const pw = q<HTMLElement>("#pw");
  const pulseSvg = q<SVGSVGElement>("#pulsesvg");
  const pulseR = q<SVGRectElement>("#pulserect");
  const bbar = q<HTMLElement>("#bbar");
  const skip = q<HTMLElement>("#skip");
  const BIG_BEND = Math.abs(BEND_ROTATE) > 45;
  if (!ctx) return () => {};

  const cl = (v: number, a?: number, b?: number) =>
    Math.max(a === undefined ? 0 : a, Math.min(b === undefined ? 1 : b, v));
  function ss(v: number) { v = cl(v); return v * v * (3 - 2 * v); }
  function ph(t: number, a: number, b: number) { return cl((t - a) / (b - a)); }
  function stag(p: number, i: number) { return cl(p * 2.75 - i * 0.35); }
  function num(v: number) { return Math.round(v * 10) / 10; }

  /* ---- color utils ---- */
  function hx(h: string): number[] {
    return [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
  }
  function mix(a: string, b: string, t: number) {
    const A = hx(a), B = hx(b);
    const c = A.map((v, i) => Math.round(v + (B[i] - v) * t));
    return "#" + c.map((v) => v.toString(16).padStart(2, "0")).join("");
  }
  const BASE = ["#B84A3C", "#3A66B8", "#3B7D5E", "#D9D7D2", "#2A2C30", "#C9A227"]; /* 赤青緑白黒黄 (手前→奥) */
  const COL: Col[] = BASE.map((b) => ({
    base: b,
    dark: mix(b, "#000000", 0.42),
    d2: mix(b, "#000000", 0.60),
    lite: mix(b, "#ffffff", 0.48),
  }));
  COL[3].dark = "#94918b"; COL[3].d2 = "#6f6d68"; COL[3].lite = "#ffffff"; /* 白 */
  COL[4].lite = "#767d88"; COL[4].dark = "#1b1d21"; COL[4].d2 = "#141619"; /* 黒 */
  const STEEL: Col = { base: "#565d66", dark: "#3a3f46", d2: "#2b2f35", lite: "#9aa2ac" };

  /* ---- geometry ---- */
  type Geom = ReturnType<typeof geom>;
  function geom() {
    const W = docEl.clientWidth, vh = innerHeight, m = W < 720;
    const gap = m ? 7 : 13, rr = m ? 2.6 : 5;
    const trunkLeft = m ? 10 : 38, bendR = m ? 14 : 30;
    const heroH = hero.offsetHeight;
    const y0 = Math.round(heroH * (m ? 0.80 : 0.70)) + Math.round(2.5 * gap);
    const ys = Array.from({ length: 6 }, (_, i) => y0 - i * gap);
    const cx0 = trunkLeft + bendR + 5 * gap;
    return {
      W, vh, m, gap, rr, bodyW: rr * 2, trunkLeft, bendR, heroH, y0, ys, cx0,
      tx: Array.from({ length: 6 }, (_, i) => cx0 - bendR - i * gap),
    };
  }
  let G: Geom = geom();
  /* .g3 ルートのページ座標（ローカル座標変換用） */
  let g3Top = 0, g3Left = 0;

  function pageXY(el: HTMLElement) {
    let x = 0, y = 0, n: Element | null = el;
    while (n instanceof HTMLElement) { x += n.offsetLeft; y += n.offsetTop; n = n.offsetParent; }
    return { x, y };
  }
  function syncOrigin() {
    const p = pageXY(rootEl);
    g3Top = p.y; g3Left = p.x;
  }

  /* ---- canvas helpers ---- */
  function rrect(c: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
    r = Math.min(r, w / 2, h / 2);
    c.beginPath();
    c.moveTo(x + r, y); c.arcTo(x + w, y, x + w, y + h, r); c.arcTo(x + w, y + h, x, y + h, r);
    c.arcTo(x, y + h, x, y, r); c.arcTo(x, y, x + w, y, r); c.closePath();
  }
  function cable(c: CanvasRenderingContext2D, x1: number, x2: number, y: number, r: number, col: Col, spec?: boolean) {
    if (x2 - x1 < 1) return;
    const g = c.createLinearGradient(0, y - r, 0, y + r);
    g.addColorStop(0, col.d2);
    g.addColorStop(0.20, col.lite);
    g.addColorStop(0.42, col.base);
    g.addColorStop(0.82, col.dark);
    g.addColorStop(1, col.d2);
    c.fillStyle = g;
    c.fillRect(x1, y - r, x2 - x1, r * 2);
    if (spec !== false) {
      c.fillStyle = "rgba(255,255,255,.20)";
      c.fillRect(x1, y - r * 0.52, x2 - x1, Math.max(1, r * 0.16));
    }
  }
  function bar(c: CanvasRenderingContext2D, x1: number, x2: number, y: number, h: number) {
    const g = c.createLinearGradient(0, y, 0, y + h);
    g.addColorStop(0, "#636b75"); g.addColorStop(0.42, "#454b53"); g.addColorStop(1, "#2c3037");
    c.fillStyle = g; c.fillRect(x1, y, x2 - x1, h);
    c.fillStyle = "rgba(205,214,224,.5)"; c.fillRect(x1, y, x2 - x1, 1);
    c.fillStyle = "rgba(0,0,0,.35)"; c.fillRect(x1, y + h - 1, x2 - x1, 1);
  }
  /* noise tile */
  const NZ = doc.createElement("canvas"); NZ.width = NZ.height = 128;
  (() => {
    const n = NZ.getContext("2d");
    if (!n) return;
    const id = n.createImageData(128, 128);
    for (let i = 0; i < id.data.length; i += 4) {
      const v = (Math.random() * 255) | 0;
      id.data[i] = id.data[i + 1] = id.data[i + 2] = v;
      id.data[i + 3] = 10;
    }
    n.putImageData(id, 0, 0);
  })();
  let NZP: CanvasPattern | null = null;

  /* ---- canvas sizing ---- */
  let dpr = 1;
  function sizeCanvas() {
    dpr = Math.min(2, devicePixelRatio || 1);
    cv.width = Math.round(G.W * dpr);
    cv.height = Math.round(G.heroH * dpr);
    cv.style.width = G.W + "px";
    cv.style.height = G.heroH + "px";
    ctx!.setTransform(dpr, 0, 0, dpr, 0, 0);
    NZP = ctx!.createPattern(NZ, "repeat");
  }

  /* ---- 起「結束の一拍」ロード演出（1回のみ・1.5秒以内） ---- */
  const IN = { t0: performance.now(), done: RM || introPlayed };
  function introEase(now: number) {
    if (IN.done) return { p: 1, el: 1e9 };
    const el = now - IN.t0;
    if (el > 1500) { IN.done = true; introPlayed = true; return { p: 1, el }; }
    const qq = Math.min(1, el / 900);
    return { p: qq >= 1 ? 1 : 1 - Math.pow(2, -10 * qq), el }; /* easeOutExpo */
  }

  /* ---- hero drawing ---- */
  let mx = 0, my = 0, tmx = 0, tmy = 0;
  function drawTube(y: number, r: number, drift: number, W: number) {
    const c = ctx!;
    cable(c, -40, W + 40, y, r, STEEL, false);
    const cw = 18, per = 320;
    let off = ((drift % per) + per) % per;
    for (let x = -per + off; x < W + per; x += per) {
      const g = c.createLinearGradient(0, y - r - 1.5, 0, y + r + 1.5);
      g.addColorStop(0, "#3c424a"); g.addColorStop(0.3, "#79828d"); g.addColorStop(1, "#31363d");
      c.fillStyle = g;
      rrect(c, x, y - r - 1.5, cw, r * 2 + 3, 2); c.fill();
      c.fillStyle = "rgba(0,0,0,.3)";
      c.fillRect(x + 4, y - r - 1.5, 1, r * 2 + 3); c.fillRect(x + cw - 5, y - r - 1.5, 1, r * 2 + 3);
    }
    const per2 = 160; off = (((drift + 80) % per2) + per2) % per2;
    c.fillStyle = "#272b31";
    for (let x = -per2 + off; x < W + per2; x += per2) {
      c.fillRect(x, y - r - 2.5, 4, r * 2 + 5);
      c.fillRect(x - 2.5, y + r + 1, 9, 2);
    }
  }
  function draw(now: number) {
    const c = ctx!;
    const t = now / 1000, W = G.W, H = G.heroH, m = G.m;
    const sy = Math.min(scrollY, H * 1.2);
    mx += (tmx - mx) * 0.055; my += (tmy - my) * 0.055;
    const IE = introEase(now);
    const endX = -40 + (W + 80) * IE.p; /* 左→右へ布設 */
    /* bg */
    const bg = c.createLinearGradient(0, 0, 0, H);
    bg.addColorStop(0, "#171a1f"); bg.addColorStop(0.55, "#121417"); bg.addColorStop(1, "#0e1013");
    c.fillStyle = bg; c.fillRect(0, 0, W, H);

    /* L0: EMTコンジット並走（最奥・低速） */
    const oy0 = sy * 0.30 + my * 8, ox0 = mx * 10 - sy * 0.03;
    const b0 = H * (m ? 0.19 : 0.22) + oy0, tr0 = m ? 2.6 : 4.2;
    for (let j = 0; j < 3; j++) drawTube(b0 + j * (m ? 14 : 21), tr0, ox0, W);
    c.fillStyle = "rgba(17,19,23,.42)"; c.fillRect(0, 0, W, H);

    /* L1: 第2ラック（中景） */
    if (!m) {
      const oy1 = sy * 0.16 + my * 5, ox1 = mx * 6 - sy * 0.06;
      const y1 = H * 0.42 + oy1, r1 = 3, sp1 = 9;
      const per1 = 78; const off1 = ((ox1 % per1) + per1) % per1;
      c.strokeStyle = "#31363d"; c.lineWidth = 5; c.lineCap = "butt";
      for (let x = -per1 + off1; x < W + per1; x += per1) {
        c.beginPath(); c.moveTo(x, y1 + sp1 + 6); c.lineTo(x + 6, y1 - 2 * sp1 - 8); c.stroke();
      }
      const g1c: Col = { base: "#454a52", dark: "#33373d", d2: "#282c31", lite: "#6b727b" };
      for (let i = 2; i >= 0; i--) cable(c, -20, W + 20, y1 - i * sp1, r1, g1c, false);
      bar(c, -20, W + 20, y1 + r1 + 3, 6);
      c.fillStyle = "rgba(17,19,23,.30)"; c.fillRect(0, 0, W, H);
    }

    /* L2: メインラック（前景・水平貫通） */
    const drift = mx * 12 - sy * 0.10;
    const ys = G.ys, rr = G.rr, y0 = G.y0;
    const railFy = ys[5] - G.gap * 1.15, railFh = m ? 4 : 6;
    const yN = y0 + rr + (m ? 4 : 7), ob = m ? 7 : 12;
    const sp = m ? 64 : 96; const off = ((drift % sp) + sp) % sp;
    const rxs: number[] = [];
    for (let x = off - sp * 2; x < W + sp; x += sp) rxs.push(x);
    /* 吊りロッド */
    c.lineWidth = 2;
    rxs.forEach((x, k) => {
      if (k % 3 !== 1) return;
      const rx = x + ob + 2;
      const g = c.createLinearGradient(0, railFy - 84, 0, railFy);
      g.addColorStop(0, "rgba(52,59,67,0)"); g.addColorStop(1, "rgba(62,69,78,.9)");
      c.strokeStyle = g;
      c.beginPath(); c.moveTo(rx, railFy - 84); c.lineTo(rx, railFy); c.stroke();
      c.fillStyle = "#4a515a"; c.fillRect(rx - 3, railFy - 3, 6, 3);
    });
    /* 奥側レール */
    bar(c, -20, W + 20, railFy - railFh, railFh);
    /* 桟 */
    rxs.forEach((x) => {
      c.strokeStyle = "#3d444c"; c.lineWidth = m ? 5 : 8;
      c.beginPath(); c.moveTo(x, yN + (m ? 4 : 6)); c.lineTo(x + ob, railFy); c.stroke();
      c.strokeStyle = "rgba(122,131,141,.55)"; c.lineWidth = 1.4;
      c.beginPath(); c.moveTo(x - (m ? 2 : 3), yN + (m ? 4 : 6)); c.lineTo(x + ob - (m ? 2 : 3), railFy); c.stroke();
    });
    /* 6色ケーブル（完全平行・等間隔・introで左→右描画） */
    for (let i = 5; i >= 0; i--) cable(c, -40, endX, ys[i], rr, COL[i]);
    /* 結束バンド（等間隔・introで左から順に「パチン」） */
    let colIdx = 0;
    rxs.forEach((x, k) => {
      if (k % 2 !== 0) return;
      const cc = colIdx++;
      let sc = 1, gl = 0;
      if (!IN.done) {
        const tau = (IE.el - (640 + cc * 20)) / 170;
        if (tau < 0) return;
        if (tau < 1) {
          const qq = 1 - Math.pow(1 - tau, 3);
          sc = 1 + 0.18 * (1 - qq);
          gl = Math.max(0, 0.5 * (1 - tau / 0.38));
        }
      }
      for (let i = 0; i < 6; i++) {
        const bx = x + ob * (i / 5) * 0.85, yy = ys[i];
        if (bx > endX - 6 || bx < -20) continue;
        const h0 = rr * 2 + 3.2, hh = h0 * sc;
        c.fillStyle = "rgba(9,11,14,.92)";
        rrect(c, bx - 2.6, yy - hh / 2, 5.2, hh, 2); c.fill();
        c.fillStyle = "rgba(190,200,212,.16)";
        c.fillRect(bx - 2.6, yy - hh / 2, 1, hh);
        c.fillStyle = "#1d2126";
        c.fillRect(bx - 1.6, yy - rr - (m ? 3.4 : 4.4) * sc, 3.2, m ? 2.6 : 3.4);
        if (gl > 0) {
          c.globalCompositeOperation = "lighter";
          c.fillStyle = "rgba(255,240,214," + gl.toFixed(3) + ")";
          rrect(c, bx - 3.2, yy - hh / 2 - 1, 6.4, hh + 2, 2.5); c.fill();
          c.globalCompositeOperation = "source-over";
        }
      }
    });
    /* 手前レール+ボルト */
    const railNy = y0 + rr + (m ? 3 : 5), railNh = m ? 6 : 10;
    bar(c, -20, W + 20, railNy, railNh);
    c.fillStyle = "#23272d";
    rxs.forEach((x) => { c.beginPath(); c.arc(x, railNy + railNh / 2, m ? 1.2 : 1.8, 0, 7); c.fill(); });

    if (!RM && IN.done) {
      /* スペキュラハイライト走行 */
      const swp = ((t * 72) % (W + 560)) - 280;
      c.globalCompositeOperation = "lighter";
      for (let i = 0; i < 6; i++) {
        const gg = c.createLinearGradient(swp - 150, 0, swp + 150, 0);
        gg.addColorStop(0, "rgba(255,255,255,0)");
        gg.addColorStop(0.5, "rgba(255,255,255,.14)");
        gg.addColorStop(1, "rgba(255,255,255,0)");
        c.fillStyle = gg;
        c.fillRect(Math.max(swp - 150, -40), ys[i] - rr * 0.62, 300, rr * 0.8);
      }
      /* 電流パルス（1本ずつ・右→左＝ベンドへ流れ込む） */
      const cyc = 2.6, k = Math.floor(t / cyc) % 6, p = (t % cyc) / cyc;
      const px = W + 120 - p * (W + 180);
      const a = Math.sin(p * Math.PI) * 0.55;
      const pg = c.createLinearGradient(px - 70, 0, px + 70, 0);
      const lc = hx(COL[k].lite);
      pg.addColorStop(0, "rgba(0,0,0,0)");
      pg.addColorStop(0.5, "rgba(" + lc[0] + "," + lc[1] + "," + lc[2] + "," + a.toFixed(3) + ")");
      pg.addColorStop(1, "rgba(0,0,0,0)");
      c.fillStyle = pg;
      c.fillRect(Math.max(px - 70, -40), ys[k] - rr * 0.9, 140, rr * 1.8);
      c.globalCompositeOperation = "source-over";
    }

    /* 粒子ノイズ + ビネット */
    if (NZP) { c.globalAlpha = 0.55; c.fillStyle = NZP; c.fillRect(0, 0, W, H); c.globalAlpha = 1; }
    const vg = c.createLinearGradient(0, H * 0.72, 0, H);
    vg.addColorStop(0, "rgba(14,16,19,0)"); vg.addColorStop(1, "rgba(13,15,18,.55)");
    c.fillStyle = vg; c.fillRect(0, H * 0.72, W, H * 0.28);
  }

  /* ---- shared svg cable (3-pass円筒シェーディング) ---- */
  function svgCable(d: string, col: Col, w: number, cls: string) {
    const dk = w + 2.4, bs = Math.max(1.6, w - 2.6);
    return '<g class="' + (cls || "") + '">' +
      '<path d="' + d + '" fill="none" stroke="' + col.d2 + '" stroke-width="' + dk + '"/>' +
      '<path d="' + d + '" fill="none" stroke="' + col.base + '" stroke-width="' + bs + '"/>' +
      '<path d="' + d + '" fill="none" stroke="' + col.lite + '" stroke-width="1.4" stroke-opacity=".7" transform="translate(-0.9,-1.1)"/>' +
      "</g>";
  }

  /* ---- 転「同心円90°ベンド」シーン ---- */
  type BendData = {
    noteWrap: HTMLElement; note: HTMLElement;
    arc: SVGGElement; tie1: SVGGElement; tie2: SVGGElement;
    text: string; n: number; paths: SVGPathElement[][]; L: number[];
  };
  let BD: BendData | null = null;
  function buildBend() {
    const W = innerWidth, H = innerHeight, m = W < 720;
    const g = m ? 11 : 20, R = m ? 46 : 96, w = m ? 10 : 18;
    const cx = W * (m ? 0.6 : 0.52), y0 = H * (m ? 0.34 : 0.38), cy = y0 + R;
    const exR = W * 1.7, exB = H * 1.7;
    const parts: string[] = [];
    for (let i = 0; i < 6; i++) {
      const yb = y0 - i * g, r = R + i * g, tx = cx - r;
      const d = "M " + num(exR) + " " + num(yb) + " L " + num(cx) + " " + num(yb) +
        " A " + r + " " + r + " 0 0 0 " + num(tx) + " " + num(cy) +
        " L " + num(tx) + " " + num(exB);
      parts.push(svgCable(d, COL[i], w, "bc bc" + i));
    }
    /* 結束バンド（水平区間・垂直区間に各1） */
    const bandTop = y0 - 5 * g - w / 2 - 5, bandH = 5 * g + w + 10;
    const t1x = cx + R * 1.5;
    parts.push('<g id="btie1" opacity="0"><rect x="' + num(t1x - 5) + '" y="' + num(bandTop) + '" width="10" height="' + num(bandH) + '" rx="3.5" fill="#0b0d10" stroke="rgba(190,200,212,.16)" stroke-width="1"/><rect x="' + num(t1x - 3) + '" y="' + num(bandTop - 8) + '" width="6" height="9" rx="2" fill="#1a1d22"/></g>');
    const bandL = cx - R - 5 * g - w / 2 - 5, bandW = 5 * g + w + 10, t2y = cy + R * 1.35;
    parts.push('<g id="btie2" opacity="0"><rect x="' + num(bandL) + '" y="' + num(t2y - 5) + '" width="' + num(bandW) + '" height="10" rx="3.5" fill="#0b0d10" stroke="rgba(190,200,212,.16)" stroke-width="1"/><rect x="' + num(bandL - 8) + '" y="' + num(t2y - 3) + '" width="9" height="6" rx="2" fill="#1a1d22"/></g>');
    /* 図面注記: 半径寸法（回転レイヤー内＝作図と一体） */
    const ra = R * 0.52;
    parts.push('<g id="bdim" opacity="0"><path d="M ' + num(cx) + " " + num(cy - ra) + " A " + num(ra) + " " + num(ra) + " 0 0 0 " + num(cx - ra) + " " + num(cy) + '" fill="none" stroke="#8f97a1" stroke-width="1.2" stroke-dasharray="4 6"/>' +
      '<line x1="' + num(cx) + '" y1="' + num(cy) + '" x2="' + num(cx - ra * 0.7071) + '" y2="' + num(cy - ra * 0.7071) + '" stroke="#8f97a1" stroke-width="1" stroke-dasharray="3 5"/>' +
      '<text x="' + num(cx - ra * 0.42) + '" y="' + num(cy - ra * 0.5) + '" font-family="Avenir Next,Helvetica Neue,Arial,sans-serif" font-size="10" letter-spacing="2" fill="#8f97a1">R</text></g>');
    bendSvg.setAttribute("viewBox", "0 0 " + W + " " + H);
    bendSvg.innerHTML = parts.join("");
    bendCam.style.transformOrigin = num(cx) + "px " + num(cy) + "px";
    const noteWrap = q<HTMLElement>("#bnotew");
    if (m) {
      /* 縦バンドルの右・水平バンドルの下の空き領域に折返し配置 */
      noteWrap.style.left = num(cx - R + 22) + "px";
      noteWrap.style.top = num(cy + 40) + "px";
      noteWrap.style.width = num(W - (cx - R + 22) - 16) + "px";
      noteWrap.style.whiteSpace = "normal";
      noteWrap.style.lineHeight = "2";
    } else {
      noteWrap.style.left = num(Math.min(cx + 56, W - 260)) + "px";
      noteWrap.style.top = num(cy + 54) + "px";
      noteWrap.style.width = "auto";
      noteWrap.style.whiteSpace = "nowrap";
    }
    BD = {
      noteWrap, note: q<HTMLElement>("#bnote"),
      arc: bendSvg.querySelector("#bdim") as SVGGElement,
      tie1: bendSvg.querySelector("#btie1") as SVGGElement,
      tie2: bendSvg.querySelector("#btie2") as SVGGElement,
      text: bendNoteText, n: -1, paths: [], L: [],
    };
    for (let i = 0; i < 6; i++) {
      const ps = Array.from(bendSvg.querySelectorAll<SVGPathElement>(".bc" + i + " path"));
      const L = ps[0].getTotalLength() + 2;
      ps.forEach((p) => { p.style.strokeDasharray = String(L); p.style.strokeDashoffset = String(L); });
      BD.paths.push(ps); BD.L.push(L);
    }
  }
  function applyBend(t: number, noRotate: boolean) {
    if (!BD) return;
    const rot = noRotate ? 0 : t * BEND_ROTATE;
    const sc = noRotate ? 1 : 1 + t * (BIG_BEND ? 0.04 : 0.12);
    bendCam.style.transform = "translateZ(0) rotate(" + num(rot * 10) / 10 + "deg) scale(" + sc.toFixed(4) + ")";
    const dp = cl(t / 0.72);
    for (let i = 0; i < 6; i++) {
      /* 外周（i=5）から時差で。先端の周速は同じ→内側が先に曲がり終わる */
      const s = ss(cl(dp * 1.42 - (5 - i) * 0.075));
      const off = Math.max(0, BD.L[i] * (1 - (0.24 + 0.76 * s)));
      BD.paths[i].forEach((p) => { p.style.strokeDashoffset = String(off); });
    }
    const n = Math.round(BD.text.length * cl((t - 0.3) / 0.42));
    if (n !== BD.n) { BD.n = n; BD.note.textContent = BD.text.slice(0, n); }
    BD.noteWrap.style.opacity = String(cl((t - 0.32) * 6));
    BD.arc.style.opacity = String(cl((t - 0.5) * 4) * 0.85);
    BD.tie1.style.opacity = String(cl((t - 0.42) * 6));
    BD.tie2.style.opacity = String(cl((t - 0.52) * 5));
  }

  /* ---- 結「端子台4拍フィナーレ」シーン ---- */
  type TermData = { sx: number; cys: number[]; wires: SVGGElement[]; screws: SVGGElement[]; lits: SVGCircleElement[]; halos: SVGCircleElement[] };
  let TB: TermData | null = null;
  function buildTerm() {
    const bx = 400, bw = 190, sx = 498, lx = 552;
    const parts: string[] = [], cys: number[] = [];
    parts.push('<text x="' + bx + '" y="12" font-family="Avenir Next,Helvetica Neue,Arial,sans-serif" font-size="11" font-weight="700" letter-spacing="4" fill="#5c646e">TERMINAL BLOCK</text>');
    parts.push('<rect x="' + bx + '" y="24" width="' + bw + '" height="402" rx="12" fill="#171b21" stroke="#39404a" stroke-width="1.4"/>');
    parts.push('<line x1="' + (bx + 10) + '" y1="38" x2="' + (bx + 10) + '" y2="412" stroke="#242930" stroke-width="2"/>');
    parts.push('<line x1="' + (bx + bw - 10) + '" y1="38" x2="' + (bx + bw - 10) + '" y2="412" stroke="#242930" stroke-width="2"/>');
    for (let i = 0; i < 6; i++) {
      const cy = 60 + i * 66; cys.push(cy);
      const col = COL[i];
      parts.push('<rect x="414" y="' + (cy - 24) + '" width="162" height="48" rx="4" fill="#21262e" stroke="#2c333c" stroke-width="1"/>');
      parts.push('<rect x="' + (bx - 2) + '" y="' + (cy - 9) + '" width="24" height="18" rx="2" fill="#0d0f12" stroke="#2c333c" stroke-width="1"/>');
      parts.push('<rect x="428" y="' + (cy - 8) + '" width="16" height="16" fill="none" stroke="#59616b" stroke-width="2"/>');
      /* ①芯線+フェルール（挿入） */
      parts.push('<g id="wg' + i + '" transform="translate(-150 0)">' +
        svgCable("M -1400 " + cy + " L 372 " + cy, col, 14, "") +
        '<rect x="346" y="' + (cy - 10) + '" width="26" height="20" rx="3" fill="' + col.base + '" stroke="' + col.d2 + '" stroke-width="1.2"/>' +
        '<rect x="372" y="' + (cy - 6) + '" width="60" height="12" rx="2" fill="#9aa2ac" stroke="#565d66" stroke-width="1"/>' +
        "</g>");
      /* ②ネジ頭（マイナス溝が回る） */
      parts.push('<g id="sc' + i + '"><circle cx="' + sx + '" cy="' + cy + '" r="14" fill="#8f97a1" stroke="#565d66" stroke-width="1"/>' +
        '<line x1="' + (sx - 9) + '" y1="' + cy + '" x2="' + (sx + 9) + '" y2="' + cy + '" stroke="#3a4046" stroke-width="3.2" stroke-linecap="round"/>' +
        '<circle cx="' + (sx + 6.4) + '" cy="' + (cy - 6.4) + '" r="1.6" fill="#6a727c"/></g>');
      /* ③ランプ */
      parts.push('<circle id="hl' + i + '" cx="' + lx + '" cy="' + cy + '" r="15" fill="' + col.lite + '" opacity="0"/>');
      parts.push('<circle cx="' + lx + '" cy="' + cy + '" r="6.5" fill="#22262b" stroke="#3a4046" stroke-width="1"/>');
      parts.push('<circle id="lp' + i + '" cx="' + lx + '" cy="' + cy + '" r="6.5" fill="' + col.lite + '" opacity="0"/>');
    }
    termSvg.setAttribute("viewBox", "0 0 620 450");
    termSvg.innerHTML = parts.join("");
    TB = { sx, cys, wires: [], screws: [], lits: [], halos: [] };
    for (let i = 0; i < 6; i++) {
      TB.wires.push(termSvg.querySelector("#wg" + i) as SVGGElement);
      TB.screws.push(termSvg.querySelector("#sc" + i) as SVGGElement);
      TB.lits.push(termSvg.querySelector("#lp" + i) as SVGCircleElement);
      TB.halos.push(termSvg.querySelector("#hl" + i) as SVGCircleElement);
    }
  }
  function applyTerm(t: number) {
    if (!TB) return;
    const p1 = ph(t, 0, 0.28), p2 = ph(t, 0.3, 0.54), p3 = ph(t, 0.56, 0.78), p4 = ph(t, 0.8, 1);
    for (let i = 0; i < 6; i++) {
      TB.wires[i].setAttribute("transform", "translate(" + num(-150 * (1 - ss(stag(p1, i)))) + " 0)");
      TB.screws[i].setAttribute("transform", "rotate(" + num(270 * ss(stag(p2, i))) + " " + TB.sx + " " + TB.cys[i] + ")");
      const lv = cl((p3 * 6.4 - i) * 1.4);
      TB.lits[i].style.opacity = lv.toFixed(3);
      TB.halos[i].style.opacity = (lv * 0.32).toFixed(3);
    }
    const e4 = ss(p4);
    finEl.style.transform = "translateY(" + num((1 - e4) * 112) + "%)";
    const co = cl((p4 - 0.22) * 2.4);
    termcta.style.opacity = co.toFixed(3);
    termcta.style.pointerEvents = co > 0.4 ? "auto" : "none";
    pulseR.style.opacity = (Math.sin(cl(p4) * Math.PI) * 0.95).toFixed(3);
    pulseR.setAttribute("stroke-dashoffset", String(num(-p4 * 100)));
  }
  function sizePulse() {
    const b = pw.querySelector<HTMLElement>(".btn");
    if (!b) return;
    const w = b.offsetWidth + 8, h = b.offsetHeight + 8;
    pulseSvg.setAttribute("viewBox", "0 0 " + w + " " + h);
    pulseR.setAttribute("width", String(w - 4)); pulseR.setAttribute("height", String(h - 4));
    pulseR.setAttribute("rx", String((h - 4) / 2)); pulseR.setAttribute("ry", String((h - 4) / 2));
  }

  /* ---- overlay（垂直幹線・結束・分岐・通電グローヘッド） ---- */
  type Branch = { paths: SVGPathElement[]; L: number; ring: SVGCircleElement; ul: SVGLineElement; jb: SVGGElement; y: number; last: number };
  let TRpaths: SVGPathElement[] = [], TRL = 0, TRtop = 0;
  let TRmid: SVGPathElement | null = null;
  let TIES: { el: SVGGElement; y: number }[] = [];
  let BR: Branch[] = [];
  let LIT: { el: HTMLElement; y: number; v: number }[] = [];
  let GH: { g: SVGGElement; trail: SVGRectElement } | null = null;
  function buildOverlay() {
    G = geom();
    rootEl.style.setProperty("--padL", (G.cx0 + (G.m ? 34 : 56)) + "px");
    syncOrigin();
    const docH = rootEl.scrollHeight;
    const W = G.W, m = G.m, gap = G.gap, bodyW = G.bodyW;
    ov.setAttribute("width", String(W)); ov.setAttribute("height", String(docH));
    ov.setAttribute("viewBox", "0 0 " + W + " " + docH);

    /* 以降の座標は全て .g3 ルート基準のローカル座標 */
    const heads = Array.from(rootEl.querySelectorAll<HTMLElement>("h2.bh")).map((h) => {
      const p = pageXY(h);
      return { left: p.x - g3Left, bottom: p.y - g3Top + h.offsetHeight, width: h.offsetWidth };
    });
    TRtop = pageXY(q<HTMLElement>("#philosophy")).y - g3Top - (m ? 24 : 40);
    const trunkEnd = pageXY(q<HTMLElement>("#terminal")).y - g3Top + Math.round(G.vh * 0.15);

    const parts: string[] = [];
    parts.push("<defs>" +
      '<radialGradient id="ghg"><stop offset="0" stop-color="#fff7e6" stop-opacity=".9"/><stop offset=".35" stop-color="#ffe9b8" stop-opacity=".36"/><stop offset="1" stop-color="#ffe9b8" stop-opacity="0"/></radialGradient>' +
      '<linearGradient id="ght" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffedc4" stop-opacity="0"/><stop offset="1" stop-color="#ffedc4" stop-opacity=".5"/></linearGradient>' +
      "</defs>");

    /* 垂直幹線 6本 */
    for (let i = 0; i < 6; i++) {
      const d = "M " + G.tx[i] + " " + num(TRtop) + " L " + G.tx[i] + " " + num(trunkEnd);
      parts.push(svgCable(d, COL[i], bodyW, "tk tk" + i));
    }

    /* 分岐ボックス位置（結束の回避に先行して計算） */
    const bx0 = G.trunkLeft - G.rr - 9;
    const bw = 5 * gap + bodyW + 18;
    const boxH = m ? 20 : 27;
    const boxes = heads.map((h) => h.bottom + (m ? 34 : 48));

    /* 結束（等間隔・分岐ボックス付近は回避） */
    const span = 5 * gap + bodyW;
    const step = m ? 130 : 180;
    const tieX = G.trunkLeft - G.rr - 4;
    for (let y = TRtop + 80; y < trunkEnd - 120; y += step) {
      if (boxes.some((b) => Math.abs(y - b) < boxH + 16)) continue;
      parts.push('<g class="tie" data-y="' + num(y) + '"><rect x="' + tieX + '" y="' + num(y - 4) + '" width="' + (span + 8) + '" height="8" rx="2.5" fill="#0b0d10" stroke="rgba(190,200,212,.15)" stroke-width=".8"/>' +
        '<rect x="' + num(tieX + span + 5) + '" y="' + num(y - 6) + '" width="4.5" height="12" rx="1.5" fill="#171a1f" stroke="rgba(190,200,212,.15)" stroke-width=".8"/></g>');
    }

    /* 分岐（scrub対応: 初期は消灯状態、進捗はJSで写像） */
    const bW2 = m ? 4 : 7;
    for (let s = 0; s < 6; s++) {
      const h = heads[s]; if (!h) continue;
      const boxCy = boxes[s];
      const col = COL[s];
      parts.push('<g class="jbox" data-s="' + s + '" style="opacity:0">' +
        '<rect x="' + bx0 + '" y="' + num(boxCy - boxH / 2) + '" width="' + bw + '" height="' + boxH + '" rx="6" fill="#171b20" stroke="#39404a" stroke-width="1"/>' +
        '<circle cx="' + num(bx0 + 7) + '" cy="' + num(boxCy - boxH / 2 + 7) + '" r="1.8" fill="#4a515a"/>' +
        '<circle cx="' + num(bx0 + bw - 7) + '" cy="' + num(boxCy + boxH / 2 - 7) + '" r="1.8" fill="#4a515a"/>' +
        '<text x="' + num(bx0 + bw / 2) + '" y="' + num(boxCy + 3.5) + '" text-anchor="middle" font-family="Avenir Next,Helvetica Neue,Arial,sans-serif" font-size="' + (m ? 8 : 10) + '" font-weight="700" letter-spacing="2.5" fill="' + col.lite + '">0' + (s + 1) + "</text></g>");
      const rE = m ? 10 : 16;
      const stubX = Math.max(h.left + 6, bx0 + bw + rE + 14);
      const xe = stubX - rE;
      const ringY = h.bottom + 6;
      const dB = "M " + num(bx0 + bw - 2) + " " + num(boxCy) +
        " L " + num(xe) + " " + num(boxCy) +
        " A " + rE + " " + rE + " 0 0 0 " + num(stubX) + " " + num(boxCy - rE) +
        " L " + num(stubX) + " " + num(ringY + 5);
      const uw = Math.max(40, Math.min(h.width - 24, 250));
      parts.push('<g class="branch" data-s="' + s + '">' +
        svgCable(dB, col, bW2, "bp") +
        '<line class="ul" x1="' + num(stubX + 12) + '" y1="' + num(ringY) + '" x2="' + num(stubX + 12 + uw) + '" y2="' + num(ringY) + '" stroke="' + col.base + '" stroke-opacity=".38" stroke-width="2" style="opacity:0"/>' +
        '<circle class="ring" cx="' + num(stubX) + '" cy="' + num(ringY) + '" r="4.5" fill="#121417" stroke="' + col.base + '" stroke-width="2.4" style="opacity:0"/>' +
        "</g>");
    }

    /* 承「通電グローヘッド」（描画先端の光球+残像トレイル） */
    parts.push('<g id="ghead" opacity="0" style="mix-blend-mode:screen">' +
      '<rect id="gtrail" x="-2" y="-30" width="4" height="30" rx="2" fill="url(#ght)"/>' +
      '<circle r="13" fill="url(#ghg)"/>' +
      '<circle r="2.8" fill="#fff3d8"/></g>');

    ov.innerHTML = parts.join("");

    /* caches */
    TRpaths = Array.from(ov.querySelectorAll<SVGPathElement>(".tk path"));
    TRmid = ov.querySelector<SVGPathElement>(".tk3 path");
    TRL = TRmid!.getTotalLength();
    TRpaths.forEach((p) => { p.style.strokeDasharray = String(TRL + 2); p.style.strokeDashoffset = String(TRL + 2); });
    TIES = Array.from(ov.querySelectorAll<SVGGElement>(".tie")).map((el) => ({ el, y: +(el.dataset.y || 0) }));
    BR = [];
    for (let s = 0; s < 6; s++) {
      const g = ov.querySelector<SVGGElement>('.branch[data-s="' + s + '"]');
      const jb = ov.querySelector<SVGGElement>('.jbox[data-s="' + s + '"]');
      if (!g || !jb) continue;
      const paths = Array.from(g.querySelectorAll<SVGPathElement>("path"));
      const L = paths[0].getTotalLength() + 1;
      paths.forEach((p) => { p.style.strokeDasharray = String(L); p.style.strokeDashoffset = String(L); });
      BR.push({ paths, L, ring: g.querySelector(".ring") as SVGCircleElement, ul: g.querySelector(".ul") as SVGLineElement, jb, y: boxes[s], last: -1 });
    }
    LIT = Array.from(rootEl.querySelectorAll<HTMLElement>(".g3-main h2.bh, .g3-main h2.nh")).map((h) => {
      const p = pageXY(h);
      return { el: h, y: p.y - g3Top + h.offsetHeight / 2, v: -1 };
    });
    GH = { g: ov.querySelector("#ghead") as SVGGElement, trail: ov.querySelector("#gtrail") as SVGRectElement };
  }

  /* ---- measurements（ローカル座標） ---- */
  let M: { vh: number; heroTop: number; heroH: number; bendTop: number; bendH: number; termTop: number; termH: number } | null = null;
  function measure() {
    syncOrigin();
    const bendS = q<HTMLElement>("#bend"), termS = q<HTMLElement>("#terminal");
    M = {
      vh: innerHeight,
      heroTop: pageXY(hero).y - g3Top,
      heroH: hero.offsetHeight,
      bendTop: pageXY(bendS).y - g3Top, bendH: bendS.offsetHeight,
      termTop: pageXY(termS).y - g3Top, termH: termS.offsetHeight,
    };
  }

  /* ---- master scroll fx（全てscrub＝逆行追従） ---- */
  let lastRev = -1, lastBendT = -1, lastTermT = -1, pyv = 0, svv = 0;
  function fx(now: number) {
    if (!M || !GH || !TRmid) return;
    const y = scrollY - g3Top, vh = M.vh;
    const dy = y - pyv; pyv = y;
    svv += (dy - svv) * 0.16;
    const av = Math.min(48, Math.abs(svv));
    const ty = y + vh * 0.8;

    /* 幹線リビール */
    const rev = cl(ty - TRtop, 0, TRL);
    if (Math.abs(rev - lastRev) > 0.5) {
      lastRev = rev;
      const off = Math.max(0, TRL + 2 - rev);
      TRpaths.forEach((p) => { p.style.strokeDashoffset = String(off); });
    }
    for (const t of TIES) t.el.classList.toggle("on", ty > t.y + 34);

    /* 分岐（scrub） */
    for (const b of BR) {
      const p = cl((y + vh * 0.82 - b.y) / (vh * 0.3));
      if (Math.abs(p - b.last) < 0.004) continue;
      b.last = p;
      const dp = ss(cl((p - 0.08) / 0.72));
      const off = b.L * (1 - dp);
      b.paths.forEach((pa) => { pa.style.strokeDashoffset = String(off); });
      b.ring.style.opacity = cl((p - 0.82) * 7).toFixed(3);
      b.ul.style.opacity = (cl((p - 0.88) * 9) * 0.9).toFixed(3);
      const jo = cl(p * 2.6);
      b.jb.style.opacity = jo.toFixed(3);
      b.jb.style.transform = "translateY(" + num((1 - jo) * 8) + "px)";
    }

    /* グローヘッド（速度→輝度/尾長、上限つき・停止時は呼吸） */
    const pt = TRmid.getPointAtLength(rev);
    const f = Math.min(1, rev / 110, (TRL - rev) / 150);
    let op = f > 0 ? f * (0.34 + av * 0.011 + 0.05 * (1 + Math.sin(now / 820)) / 2) : 0;
    op = Math.min(0.8, Math.max(0, op));
    GH.g.setAttribute("opacity", op.toFixed(3));
    if (op > 0.01) {
      GH.g.setAttribute("transform", "translate(" + num(pt.x) + " " + num(pt.y) + ")");
      const tl = Math.round(Math.min(120, 26 + av * 2.4));
      GH.trail.setAttribute("height", String(tl));
      GH.trail.setAttribute("y", String(-tl));
      GH.trail.setAttribute("transform", svv >= 0 ? "" : "scale(1,-1)");
    }

    /* 見出しの照らし（--lit・レイアウト不変） */
    const hy = TRtop + rev;
    for (const h of LIT) {
      const v = op > 0.01 ? cl(1 - Math.abs(hy - h.y) / 340) : 0;
      if (Math.abs(v - h.v) > 0.015) { h.v = v; h.el.style.setProperty("--lit", v.toFixed(3)); }
    }

    /* pinnedシーン */
    const bt = cl((y - M.bendTop) / (M.bendH - vh));
    if (Math.abs(bt - lastBendT) >= 0.0005) { lastBendT = bt; applyBend(bt, false); }
    const tt = cl((y - M.termTop) / (M.termH - vh));
    if (Math.abs(tt - lastTermT) >= 0.0005) { lastTermT = tt; applyTerm(tt); }

    /* ボトムバー / スキップ導線 */
    const inTerm = (y + vh > M.termTop + 60) && (y < M.termTop + M.termH - vh * 0.35);
    bbar.classList.toggle("show", y > M.heroTop + M.heroH * 0.82 && !inTerm);
    skip.classList.toggle("show", inTerm);
  }

  /* ---- observers ---- */
  let heroVis = true;
  const io3 = new IntersectionObserver((es) => {
    es.forEach((e) => e.target.classList.toggle("in", e.isIntersecting || e.boundingClientRect.top < 0));
  }, { rootMargin: "0px 0px -8% 0px" });
  const heroIO = new IntersectionObserver((es) => {
    es.forEach((e) => { heroVis = e.isIntersecting; });
  });
  function setupObservers() {
    rootEl.querySelectorAll(".rv").forEach((el) => io3.observe(el));
    heroIO.observe(hero);
  }

  /* ---- ticker ---- */
  let disposed = false;
  let rafId = 0;
  function tick(now: number) {
    if (disposed) return;
    if (!doc.hidden) {
      if (heroVis) draw(now);
      fx(now);
    }
    rafId = requestAnimationFrame(tick);
  }

  const onPointer = (e: PointerEvent) => {
    tmx = (e.clientX / G.W - 0.5) * 2;
    tmy = (e.clientY / G.vh - 0.5) * 2;
  };
  if (FINE && !RM) addEventListener("pointermove", onPointer, { passive: true });

  function rebuild() {
    if (disposed) return;
    G = geom(); sizeCanvas(); buildBend(); buildOverlay(); measure(); sizePulse();
    lastRev = lastBendT = lastTermT = -1;
    BR.forEach((b) => { b.last = -1; });
    if (RM) { applyRMStates(); draw(0); }
  }
  let rsT: ReturnType<typeof setTimeout> | null = null;
  const onResize = () => { if (rsT) clearTimeout(rsT); rsT = setTimeout(rebuild, 180); };
  addEventListener("resize", onResize);

  /* ---- reduced-motion: 全結線済み・ランプ全点灯の完成静止状態 ---- */
  function applyRMStates() {
    TRpaths.forEach((p) => { p.style.strokeDashoffset = "0"; });
    TIES.forEach((t) => t.el.classList.add("on"));
    BR.forEach((b) => {
      b.paths.forEach((p) => { p.style.strokeDashoffset = "0"; });
      b.ring.style.opacity = "1"; b.ul.style.opacity = ".9";
      b.jb.style.opacity = "1"; b.jb.style.transform = "none";
    });
    bendCam.style.transform = "none";
    if (BD) {
      for (let i = 0; i < 6; i++) BD.paths[i].forEach((p) => { p.style.strokeDashoffset = "0"; });
      BD.note.textContent = BD.text;
      BD.noteWrap.style.opacity = "1";
      BD.arc.style.opacity = ".85";
      BD.tie1.style.opacity = "1"; BD.tie2.style.opacity = "1";
    }
    applyTerm(1);
    pulseR.style.opacity = "0";
    GH?.g.setAttribute("opacity", "0");
  }

  const rmScroll = () => {
    if (!M) return;
    const y = scrollY - g3Top, vh = innerHeight;
    const inTerm = (y + vh > M.termTop + 60) && (y < M.termTop + M.termH - vh * 0.35);
    bbar.classList.toggle("show", y > M.heroTop + M.heroH * 0.82 && !inTerm);
    skip.classList.toggle("show", inTerm);
  };

  /* ---- init ---- */
  G = geom();
  sizeCanvas();
  buildBend();
  buildTerm();
  buildOverlay();
  measure();
  sizePulse();
  setupObservers();
  if (RM) {
    rootEl.querySelectorAll(".rv").forEach((el) => el.classList.add("in"));
    applyRMStates();
    addEventListener("scroll", rmScroll, { passive: true });
    rmScroll();
    draw(0);
  } else {
    rafId = requestAnimationFrame(tick);
  }
  /* フォント/画像ロード後にレイアウトが動くため再構築（SPA 遷移では load 済みのことが多い） */
  const onLoad = () => rebuild();
  if (doc.readyState !== "complete") addEventListener("load", onLoad);
  if (doc.fonts?.ready) doc.fonts.ready.then(() => { if (!disposed) rebuild(); });

  return () => {
    disposed = true;
    cancelAnimationFrame(rafId);
    if (rsT) clearTimeout(rsT);
    removeEventListener("resize", onResize);
    removeEventListener("pointermove", onPointer);
    removeEventListener("scroll", rmScroll);
    removeEventListener("load", onLoad);
    io3.disconnect();
    heroIO.disconnect();
  };
}

/** FAQ 回答内の電話番号を tel: リンク化 */
function linkifyPhone(text: string): ReactNode {
  const idx = text.indexOf(PHONE);
  if (idx === -1) return text;
  return (
    <>
      {text.slice(0, idx)}
      <a href={`tel:${PHONE}`}>{PHONE}</a>
      {text.slice(idx + PHONE.length)}
    </>
  );
}

const SVC_COLORS = ["var(--red)", "var(--blue)", "var(--green)", "var(--white)", "var(--yellow)", "#7a828c"];

export default function Home() {
  const { lang, t, prefix } = useLanguage();
  usePageSEO("home", lang);
  const hero = t.hero[lang];
  const shoku = t.shoku[lang];
  const stance = t.stance[lang];
  const collab = t.collab[lang];
  const services = t.services[lang];
  const areaT = t.area[lang];
  const company = t.company[lang];
  const cta = t.cta[lang];
  const recruit = t.recruit[lang];
  const g3 = t.g3[lang];

  const rootRef = useRef<HTMLDivElement>(null);

  /* G3 エンジン起動（言語切替時は再構築 — 見出しサイズが変わるため） */
  useEffect(() => {
    if (!rootRef.current) return;
    return startG3(rootRef.current, g3.bendNote);
  }, [lang, g3.bendNote]);

  /* JSON-LD（Electrician + FAQPage）を head に注入 */
  useEffect(() => {
    const added: HTMLScriptElement[] = [];
    const add = (key: string, data: unknown) => {
      document
        .querySelectorAll(`script[data-g3-jsonld="${key}"]`)
        .forEach((el) => el.remove());
      const s = document.createElement("script");
      s.type = "application/ld+json";
      s.setAttribute("data-g3-jsonld", key);
      s.textContent = JSON.stringify(data);
      document.head.appendChild(s);
      added.push(s);
    };
    add("org", {
      "@context": "https://schema.org",
      "@type": "Electrician",
      name: "充寵グループ",
      alternateName: "JYUCHOU GROUP",
      url: "https://juchou-group.com/",
      telephone: PHONE,
      email: EMAIL,
      address: { "@type": "PostalAddress", addressRegion: "神奈川県", addressLocality: "秦野市" },
      areaServed: ["東京都", "神奈川県", "埼玉県", "千葉県"],
    });
    add("faq", {
      "@context": "https://schema.org",
      "@type": "FAQPage",
      mainEntity: t.g3[lang].faq.map((f) => ({
        "@type": "Question",
        name: f.q,
        acceptedAnswer: { "@type": "Answer", text: f.a },
      })),
    });
    return () => added.forEach((s) => s.remove());
  }, [lang, t]);

  return (
    <Layout>
      <div className="g3" ref={rootRef}>
        {/* ── HERO（Canvas ケーブルラック） ─────────────── */}
        <section className="hero" id="hero">
          <canvas id="cv" aria-hidden="true" />
          <div className="hero-in">
            <p className="logotype">
              充寵グループ
              <span>JYUCHOU GROUP — ELECTRICAL CONSTRUCTION</span>
            </p>
            <h1>{hero.headline}</h1>
            <p className="lead">{hero.sub}</p>
            <div className="cta-row">
              <Link className="btn p" href={`${prefix}/contact`}>
                <span className="dot" />
                {g3.btnConsult}
              </Link>
              <a className="btn s" href="#recruit">
                <span className="dot" />
                {cta.recruit}
              </a>
            </div>
            <div className="chips">
              <span className="chip">
                <i style={accent("var(--yellow)")} />
                {g3.chipRecruit}
              </span>
              <span className="chip">
                <i style={accent("var(--blue)")} />
                {g3.chipLang}
              </span>
            </div>
          </div>
          <div className="scroll-cue">
            SCROLL
            <i />
          </div>
        </section>

        {/* ── 転「同心円90°ベンド」pinnedシーン（署名ショット） ── */}
        <section className="scene" id="bend" aria-label="同心円ベンド — 曲げ半径統一の整線">
          <div className="scene-pin">
            <div className="bend-cam">
              <svg id="bendsvg" aria-hidden="true" />
            </div>
            <p className="bend-note" id="bnotew" aria-hidden="true">
              <span id="bnote" />
              <i className="crt" />
            </p>
          </div>
        </section>

        <div className="g3-main">
          <section className="sec" id="philosophy">
            <div className="wrap">
              <p className="kicker rv" style={accent("var(--red)")}><b>01</b>PHILOSOPHY</p>
              <h2 className="bh rv" data-s="0">{shoku.title}</h2>
              <p className="body rv">{shoku.body}</p>
            </div>
          </section>

          <section className="sec" id="stance">
            <div className="wrap">
              <p className="kicker rv" style={accent("var(--blue)")}><b>02</b>STANCE</p>
              <h2 className="bh rv" data-s="1">{stance.title}</h2>
              <ul className="stance">
                {stance.items.map((item, i) => (
                  <li className="rv" key={i}>
                    <span className="no">S-0{i + 1}</span>
                    <h3>{item.label}</h3>
                    <p>{item.desc}</p>
                  </li>
                ))}
              </ul>
            </div>
          </section>

          <section className="sec" id="services">
            <div className="wrap">
              <p className="kicker rv" style={accent("var(--green)")}><b>03</b>SERVICES</p>
              <h2 className="bh rv" data-s="2">{services.title}</h2>
              <div className="svc">
                {services.items.map((item, i) => (
                  <article className="rv" style={accent(SVC_COLORS[i])} key={i}>
                    <p className="sno">SVC-0{i + 1}</p>
                    <h3>{item.label}</h3>
                    <p>{item.desc}</p>
                  </article>
                ))}
              </div>
            </div>
          </section>

          <section className="sec" id="area">
            <div className="wrap">
              <p className="kicker rv" style={accent("var(--white)")}><b>04</b>AREA</p>
              <h2 className="bh rv" data-s="3">{areaT.title}</h2>
              <div className="areas rv">
                {g3.prefs.map((p) => (
                  <span key={p}>{p}</span>
                ))}
              </div>
              <p className="area-note rv">{g3.areaNote}</p>
            </div>
          </section>

          <section className="sec" id="partner">
            <div className="wrap">
              <p className="kicker rv" style={accent("#878c94")}><b>05</b>PARTNERSHIP</p>
              <h2 className="bh rv" data-s="4">{collab.title}</h2>
              <p className="body rv">{collab.body}</p>
            </div>
          </section>

          <section className="sec" id="recruit">
            <div className="wrap">
              <p className="kicker rv" style={accent("var(--yellow)")}><b>06</b>RECRUIT</p>
              <h2 className="bh rv" data-s="5">{recruit.headline}</h2>
              <div className="rec">
                <ul>
                  {g3.recruitPoints.map((pt, i) => (
                    <li className="rv" key={i}>{pt}</li>
                  ))}
                </ul>
                <div className="pay rv">
                  <p className="lab">{g3.wageLab}</p>
                  <p className="val">
                    ¥13,000<small>{g3.wageUnit}</small>
                  </p>
                  <p>{g3.wageNote}</p>
                  <Link className="btn p" href={`${prefix}/recruit`}>
                    <span className="dot" />
                    {cta.recruit}
                  </Link>
                </div>
              </div>
            </div>
          </section>

          <section className="sec" id="faq">
            <div className="wrap">
              <p className="kicker rv" style={accent("#878c94")}><b>07</b>FAQ</p>
              <h2 className="nh rv">{g3.faqTitle}</h2>
              <div className="faq">
                {g3.faq.map((f, i) => (
                  <div className="qa rv" key={i}>
                    <p className="q"><i>Q{i + 1}</i>{f.q}</p>
                    <p className="a"><i>A</i><span>{linkifyPhone(f.a)}</span></p>
                  </div>
                ))}
              </div>
            </div>
          </section>

          <section className="sec" id="company">
            <div className="wrap">
              <p className="kicker rv" style={accent("#878c94")}><b>08</b>COMPANY</p>
              <h2 className="nh rv">{company.title}</h2>
              <dl className="co rv">
                <div><dt>{company.nameLabel}</dt><dd>{company.name}</dd></div>
                <div><dt>{company.addressLabel}</dt><dd>{company.address}</dd></div>
                <div><dt>{company.businessLabel}</dt><dd>{company.business}</dd></div>
                <div><dt>{company.areaLabel}</dt><dd>{company.area}</dd></div>
                <div><dt>{company.emailLabel}</dt><dd><a href={`mailto:${EMAIL}`}>{EMAIL}</a></dd></div>
                <div><dt>{company.phoneLabel}</dt><dd><a href={`tel:${PHONE}`}>{PHONE}</a></dd></div>
                <div><dt>Instagram</dt><dd><a href={INSTAGRAM_URL} target="_blank" rel="noopener noreferrer">@juchou.group</a></dd></div>
              </dl>
            </div>
          </section>

          {/* ── 結「端子台4拍フィナーレ」pinnedシーン ── */}
          <section className="scene" id="terminal" aria-label="端子台への結線">
            <div className="scene-pin">
              <p className="scene-kick">— TERMINATION</p>
              <svg id="termsvg" aria-hidden="true" />
              <div className="term-copy">
                <div className="fin-mask">
                  <h2 className="fin" id="fin">{g3.fin}</h2>
                </div>
                <div className="cta-row" id="termcta">
                  <span className="pulse-wrap" id="pw">
                    <svg className="pulse" id="pulsesvg" aria-hidden="true">
                      <rect id="pulserect" x="2" y="2" pathLength={100} fill="none" stroke="#ffe9b8" strokeWidth="2.4" strokeDasharray="16 84" strokeLinecap="round" opacity="0" />
                    </svg>
                    <Link className="btn p" href={`${prefix}/contact`}>
                      <span className="dot" />
                      {g3.btnConsult}
                    </Link>
                  </span>
                  <Link className="btn s" href={`${prefix}/recruit`}>
                    <span className="dot" />
                    {cta.recruit}
                  </Link>
                </div>
              </div>
            </div>
          </section>

          <section className="sec" id="contact">
            <div className="wrap">
              <p className="kicker rv" style={accent("var(--green)")}><b>—</b>CONTACT</p>
              <h2 className="nh rv">{g3.contactTitle}</h2>
              <p className="body rv" style={{ marginBottom: 26 }}>{g3.contactBody}</p>
              <div className="cta-row rv" style={{ marginTop: 0 }}>
                <Link className="btn p" href={`${prefix}/recruit`}>
                  <span className="dot" />
                  {cta.recruit}
                </Link>
                <Link className="btn s" href={`${prefix}/contact`}>
                  <span className="dot" />
                  {cta.contact}
                </Link>
              </div>
              <div className="qr-row rv">
                <a className="qr" href={INSTAGRAM_URL} target="_blank" rel="noopener noreferrer">
                  <img src="/img/QR_INSTAGRAM.png" alt="充寵グループ公式InstagramのQRコード" width={74} height={74} />
                  <span className="t">Instagram<small>@juchou.group</small></span>
                </a>
                <a className="qr" href={LINEWORKS_URL} target="_blank" rel="noopener noreferrer">
                  <img src="/img/QR_LINEWORKS.png" alt="充寵グループLINE WORKSのQRコード" width={74} height={74} />
                  <span className="t">LINE WORKS<small>{g3.qrLineworks}</small></span>
                </a>
              </div>
              <p className="tel-line rv">
                TEL <a href={`tel:${PHONE}`}>{PHONE}</a>　／　MAIL <a href={`mailto:${EMAIL}`}>{EMAIL}</a>
              </p>
            </div>
          </section>
        </div>

        {/* オーバーレイ（垂直幹線・結束・分岐・グローヘッド） */}
        <svg id="ov" aria-hidden="true" />

        {/* スキップ導線（端子台シーン中のみ表示） */}
        <a className="skip" id="skip" href="#contact">{g3.skip}</a>

        {/* モバイル追従ボトムバー */}
        <div className="bbar" id="bbar">
          <Link className="bb-l" href={`${prefix}/contact`}>{g3.bbarConsult}</Link>
          <a className="bb-r" href="#recruit">
            {g3.bbarApply} <b>{g3.bbarWage}</b>
          </a>
        </div>
      </div>
    </Layout>
  );
}
