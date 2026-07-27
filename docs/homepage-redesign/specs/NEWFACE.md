# 「新しい顔」追加ブリーフ（BRIEF.md と併読・こちらが優先）

BRIEF.md のコピー・SEO要件・技術要件はすべて有効。ただし以下を上書きする。

## 最重要変更: 写真を一切使わない
- `img/HERO_BG.webp` `img/WORK_CONDUIT.webp` `img/WORK_PANEL.webp` の使用禁止。
- ビジュアルはすべて**オリジナル生成**: Canvas 2D（推奨）・インラインSVG・CSSグラデーション/フィルタのみで構築する。会社の新しい顔となるアートワークを自作すること。
- 例外: QRコード2枚（`img/QR_INSTAGRAM.png` / `img/QR_LINEWORKS.png`）は機能要素なので従来どおり使用。

## Canvas品質基準（安っぽい生成絵を避けるため厳守）
- 色数を絞る（1シーン4〜6色+透明度）。彩度は低め、発光は1色に限定。
- ベタ塗り矩形の羅列にしない。シルエット+奥行きの霞（グラデーションフォグ）+微細なノイズ/粒子で写実でなく「上質な抽象」を目指す。
- shadowBlurの多用禁止（重い&滲む）。発光はradial-gradientかglobalCompositeOperation='lighter'を計画的に。
- devicePixelRatioは最大2でクランプ。resize対応。IntersectionObserverで画面外は描画停止。requestAnimationFrameのみ。
- prefers-reduced-motion: アニメを止め、静止した完成フレームを描く（真っ黒にしない）。
- モバイル(375px)でも構図が成立すること（要素数を減らす等の分岐可）。

## 視覚セルフレビュー必須（最低2回イテレート）
書いたら必ず自分でレンダリングして目視確認し、構図・色・密度を改善すること:
```bash
cd /tmp/claude-0/-home-user-juchou-group-MasterFile/19588573-b955-55e6-900a-2baa258d1b0b/scratchpad
node -e "
import('/opt/node22/lib/node_modules/playwright/index.mjs').then(async ({chromium}) => {
  const b = await chromium.launch();
  const p = await b.newPage({viewport:{width:1440,height:900}});
  await p.goto('file:///tmp/claude-0/-home-user-juchou-group-MasterFile/19588573-b955-55e6-900a-2baa258d1b0b/scratchpad/variants/variant-X.html', {waitUntil:'load'});
  await p.waitForTimeout(3500);
  await p.screenshot({path:'shots/X-check-hero.png'});
  await p.evaluate(() => window.scrollTo({top: document.body.scrollHeight*0.4}));
  await p.waitForTimeout(1500);
  await p.screenshot({path:'shots/X-check-mid.png'});
  const m = await b.newPage({viewport:{width:390,height:844}});
  await m.goto('file:///tmp/claude-0/-home-user-juchou-group-MasterFile/19588573-b955-55e6-900a-2baa258d1b0b/scratchpad/variants/variant-X.html', {waitUntil:'load'});
  await m.waitForTimeout(2500);
  await m.screenshot({path:'shots/X-check-mobile.png'});
  await b.close();
})"
```
（X は自分の案の記号に置換。QR画像は相対パスのままなので、このプレビューでは壊れて表示されるが気にしなくてよい＝後工程でdata URIに置換される）
撮影したPNGをReadで目視 → 課題を列挙 → 修正 → 再撮影。これを最低2周。

## 縦書きの禁止事項
CSS `writing-mode: vertical-rl` は使用禁止（Linux/Android系フォントで文字が重なる実績あり）。縦組みが欲しい場合は1文字ずつ`<i>`で縦積みするflex column実装にすること。

## その他
- コピー・セクション構成・FAQ・JSON-LD・会社概要はBRIEF.mdどおり。
- ヒーローは「会社の新しい顔」となる一枚。ロゴタイプ的な扱いの「充寵グループ」の見せ方も工夫してよい。
- パララックス+スクロール演出は必須（rAF+transform）。斬新さ歓迎だが、コンセプトへの統一を最優先。
