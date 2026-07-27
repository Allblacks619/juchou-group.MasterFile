# G4b UI改良 ＋ 近未来的視認性 改善仕様

対象: `variants/variant-g4b.html`（ビルド確認は `dist/variant-g4b.html`）
確認方法: Playwright/chromium で 1440×900・390×844、各7〜8段スクロールを目視（`shots/dep-desk-*.png` / `shots/dep-mob-*.png`）
方針: オーナー＝現役電気工事士。事実性最優先（`JP-DENKI-FACTS.md` 準拠）。近未来感は「ネオン/SF装飾」ではなく**計測機器・施工図の精度**で出す。スクロール＝必ず前進（sticky長回し禁止）を厳守。

---

## 1. 所見（スクショ根拠つき）

### 良い点（維持すべき土台）
- **ヒーロー（dep-desk-00 / dep-mob-00）**: 複線図が起動時に一度だけ描き上がる方式。青焼き方眼＋クロスヘア節点（○=リングスリーブ / □=差込コネクタ / □=接続箱）で「設計図の知性」を表現。ロゴタイプのグラデ、コントラスト、情報階層は良好。sticky長回しに逆戻りしていない。
- **工種カードの作画（dep-desk-03 / dep-mob-02）**: はしご形ラック＋黒CVT＋相別テープ赤白青、ねじなしE管＋90°曲げ＋サドル、灰色VVF＋ステップル、リングスリーブ○刻印／差込コネクタ — いずれも事実に忠実。スクロール発火の1動作アニメで「前進」を担保。
- **採用カウンタ（dep-desk-05）**: ¥13,000 のカウントアップ、料金カードのアフォーダンスは良好。

### 課題（要改善）
1. **【P0】工種ステッパーがデスクトップで速く進みすぎる。** dep-desk-02（y=1602）ではレールが step0「複線図・設計」のまま、次の dep-desk-03（y=2403）では既に step4「結線」に到達。**間の 01配管 / 02ラック幹線 / 03屋内配線 に留まる瞬間が無い**。原因は `activeStep()`（919–925行）が `services` セクションの矩形高さに対する割合で 4 段を割り振るが、**デスクトップの3列グリッドでは施工内容が2行しかなく縦が約1画面しかない**ため、4段が一気に流れる。`data-rstep`（342–345行）はJSで参照されておらず死に属性。
2. **【P1】旧ヒーローモーフの scene 関数群が完全な死コード。** `pipe`/`saddles`/`coupling`/`sceneConduit`/`sceneRack`/`sceneVVF`/`sceneConnect`（約629–840行、約210行）は呼び出し無し。`drawHero`（844–868行）は `sceneDiagram` のみ使用。カード作画は別実装（`drawCardHaikan` 等 1041–1083行）。放置するとメンテ時に「ヒーローで工種が動くはず」と誤解を招く。
3. **【P1/近未来】HUD語彙が節点・SVC番号止まりで、施工図の精度感が薄い。** 図面注記（寸法・単位・型式）、等幅数字、レールの目盛り/実測%、精密なフォーカスハイライトが未使用。事実に即した型式表記（E19・R≥6D・VVF1.6-2C・CVT・E形小中大）を足せる余地が大きい。
4. **【P1】モバイルで固定バーが2段重なり、ステッパーの薄いラベルに本文が透ける（dep-mob-05）。** nav（固定）＋工種レール（固定・全ページ常駐）で上部の占有が重く、スクロール中に背後の見出し（「きますか？」等）がラベルへ薄く干渉。
5. **【P2】カード補足タグのコントラストが低い（dep-desk-03）。** `.cardtag` は `#5e666f`（暗背景でほぼ埋没）。「黒CVT・相別テープ 赤白青」等が読みにくい。
6. **【P2】モバイルFAQ Q4の電話番号が段組み崩れ（dep-mob-05）。** 太字の `tel:` リンクが折り返せず、括弧と数字が分離して3列状の醜い流し込みになる。
7. **【P2】モバイルのロゴ副題が2行折り返し（dep-mob-00）。** 「JYUCHOU GROUP — ELECTRICAL / CONSTRUCTION」が改行。

---

## 2. 改善項目リスト

### P0 — 工種ステッパーの「進みすぎ」解消（施工内容に前進の尺を与える）

**目的**: 01配管→02ラック幹線→03屋内配線→04結線 が、各カードを読む間だけ順に点灯し、飛ばさず・戻らず（前進）留まる。sticky固定ではなく**実コンテンツの縦尺**で稼ぐ。

**P0-a: デスクトップの施工内容を2列化して縦尺を確保**
- セレクタ `.svc`（167行）に対しデスクトップ幅でグリッドを2列に。
  ```css
  @media(min-width:900px){
    .svc{grid-template-columns:repeat(2,minmax(0,1fr));max-width:940px;gap:18px}
    .svc article{min-height:300px}                 /* 各カードに読ませる高さ */
    .svc .cardcv{height:88px}                       /* 作画も少し拡大 */
  }
  ```
- 6カード×2列＝3行で、施工内容セクション高さが約1画面→約1.4〜1.6画面に増える。カードも現状の3列詰めより可読になる（P2の余白粗も同時緩和）。

**P0-b: 工程順にカードDOMを並べ替え（配管→幹線→配線→結線 の昇順に）**
- 現状のDOM順は 幹線(SVC-02)→配管ラック(SVC-03) で工程が逆行。**SVC-02 と SVC-03 の `<article>` を入れ替え**、作画シーンが `haikan(配管)→kansen(ラック幹線)→okunai(屋内配線)→ketsuen(結線)` の昇順に並ぶようにする（番号 SVC-0x の表示は据置きで良い／工程の話者性を優先）。これで「読み進み＝工程前進」が一致し、ステッパーが戻らない。
- 参照されていない `data-rstep` 属性（342–345行）は削除（死に属性の掃除、外科的）。

**P0-c: `activeStep()` を平滑化し、施工内容矩形＋直後の余白まで掃引を伸ばす**
- 現状（919–925行）は `floor(f*4)` で短区間に4段を圧縮。掃引区間を「施工内容の上端が中央線を通過〜`#area` の上端が中央線に達する」まで伸ばし、各段に留まりを与える。ヒステリシス無しの単調 floor のままで良い（スクロールが単調なら前進は保たれる）。
  ```js
  const areaSec=doc.getElementById('area');
  function activeStep(){
    const refY=innerHeight*0.5;
    const sTop=svcSec.getBoundingClientRect().top;
    const aTop=areaSec.getBoundingClientRect().top;      // 次セクション上端で掃引を締める
    if(sTop>refY) return 0;                                // 施工内容前 = 設計(複線図)
    const span=Math.max(1,(aTop - sTop));                 // 施工内容の実尺(可変)
    const f=cl((refY - sTop)/span,0,1);
    return 1+Math.min(3,Math.floor(f*4));                 // 1..4 を実尺全体に均等配分
  }
  ```
- 効果: P0-a の縦尺増と併せ、各工程が概ね 0.35〜0.45画面ぶん留まる。dep-desk-02→03 のような「0→4 瞬間ジャンプ」が解消。

**検証**: 1440×900 で services 内を 8〜10段スクロールし、レールが 0→1→2→3→4 と**1段ずつ順に**点灯、各段が最低1スクショ分は単独点灯すること（`shots/` で再撮）。モバイル（元々縦長で良好）で退行が無いこと。

---

### P1 — 近未来的（施工図の精度感）＋ 死コード整理

**P1-a: 旧ヒーローモーフ scene 群を削除（死コード）**
- 削除対象: `pipe`(630)/`saddles`(646)/`coupling`(659)/`sceneConduit`(669)/`sceneRack`(679)/`sceneVVF`(744)/`sceneConnect`(780) — 約629〜840行。`drawHero` は `sceneDiagram` のみ参照なので影響なし。`routes`/`RDEF_*`/`JUNC_*`/`densify`/`sampAt` は `sceneDiagram` が使うため**残す**。
- 併せて、これらを**ヒーローにスクロール連動で再配線しない**こと（下記「やらないこと」参照）。カード実装（`drawCard*`）が正。

**P1-b: レール（工種ステッパー）をHUD計器化**
- 数字を等幅・タブラーに: `.rail .step .k{font-variant-numeric:tabular-nums;font-feature-settings:"tnum" 1}`。
- レール下端に**実測%リードアウト**を追加（近未来の計器感）。`#rail` 内トラック直後に `<span class="railpct" aria-hidden="true">`、`updateProgress()` の `gp`（927–930行で算出済）を流し込む:
  ```js
  const railpct=doc.querySelector('.railpct');
  if(railpct) railpct.textContent = String(Math.round(gp*100)).padStart(2,'0')+'%';
  ```
  ```css
  .railpct{margin-top:10px;font-family:var(--en);font-variant-numeric:tabular-nums;
    font-size:10px;letter-spacing:.18em;color:#6f7883;text-align:right;padding-right:2px}
  @media(max-width:740px){.railpct{display:none}}
  ```
- アクティブ節点のハイライトを「計器のロック感」に: 既存 `.rail .step.on .dot`（92行）の `box-shadow` を二重リング＋細い十字に寄せる（値は微調整、ネオン化はしない）。

**P1-c: カード補足に事実型式のマイクロタイポ（HUD注記）**
- `.cardtag` を等幅寄り＋コントラスト改善（P2-aと統合）し、各カードに**型式1行**を追記（すべて事実。`JP-DENKI-FACTS.md`準拠）:
  - 配管・ラック据付: `E19 / 曲げ半径 R≧6D / サドル ≦2m`（ねじなしE管・曲げは外径6倍以上・支持2m以下）
  - 幹線: `CVT / 相別テープ R•S•T = 赤•白•青`（黒シースCVT・端末相識別）
  - 配線: `VVF 1.6mm 2C・3C / ステップル固定`（灰色VVF・心線 黒白赤）
  - 盤据付・結線: `リングスリーブ E形 ○小/中/大 ／ 差込形コネクタ`（圧着刻印）
  - マークアップ例（カード内、既存 `.cardtag` の下）:
    ```html
    <span class="cardspec">E19 / 曲げ半径 R≧6D / サドル ≦2m</span>
    ```
    ```css
    .cardspec{display:block;margin-top:4px;font-family:var(--en);
      font-variant-numeric:tabular-nums;font-size:9.5px;letter-spacing:.12em;
      color:#79818b;border-left:2px solid var(--c);padding-left:8px}
    ```
- 注意: 数値・型式は上記の事実範囲のみ。**寸法を勝手に増やさない**（品番レベルのピッチ等は未裏取り＝FACTS §5-1。書かない）。

**P1-d: 精密フォーカス／ホバーの「計器ロック」ハイライト**
- キーボード可視の1pxアウトライン＋オフセット（近未来の精度感・アクセシビリティ両立）:
  ```css
  a:focus-visible,.btn:focus-visible{outline:1px solid #aeb6c0;outline-offset:3px;border-radius:6px}
  .svc article:focus-within{border-color:#5a636e}
  .nav ul a:hover{color:#fff;text-shadow:0 0 12px rgba(174,182,192,.25)}
  ```
- `¥13,000` カウンタに `font-variant-numeric:tabular-nums`（`#wage` 親 `.val` 207行）を付与し、カウント中の横揺れを防ぐ。

**P1-e: モバイルの固定バー2段重なりを軽量化**
- 全ページ常駐の工種レール（97–109行の `@media(max-width:740px)`）を**施工内容通過後はフェードして省スペース化**（「今どこ」を残しつつ占有を減らす）。`updateProgress()` 末尾で:
  ```js
  if(MB){ rail.style.opacity = (scrollY < areaSec.offsetTop - innerHeight*0.3) ? '1' : '0'; }
  ```
  （`.rail` に `transition:opacity .4s var(--ease)` は既存）。
- ステッパーの背後干渉対策: 91–108行のモバイル `.rail` 背景スクリムを不透明側へ1段強める（`rgba(11,13,17,.96)`→下端まで `.86` の二段）。ラベルは維持。

**検証**: 死コード削除後 `dist` 再ビルドし、ヒーロー描画・カード作画・レール挙動が不変であることをスクショ再撮で確認。フォーカスは Tab 巡回で可視。

---

### P2 — 仕上げ（軽微だが効く）

**P2-a: カードタグのコントラスト改善**
- `.cardtag`（177行）`color:#5e666f`→`#8a929c`、`letter-spacing:.20em`。暗背景での可読を確保（近未来の「注記が読める」精度感に直結）。

**P2-b: モバイルFAQ 電話番号の段組み崩れ修正**
- `tel:` リンクを nowrap 化し、括弧＋番号を1ユニットに:
  ```css
  .faq .a a[href^="tel"]{white-space:nowrap}
  ```
  HTML側（400行）の「お電話（<a…>050-5873-4183</a>）」を `<span style="white-space:nowrap">（<a href="tel:0508734183">050-5873-4183</a>）</span>` に包む。これで括弧と数字が分離せず、本文が自然に折り返す。

**P2-c: モバイル・ロゴ副題の1行化**
- `.logotype span`（71–72行）モバイル時に `letter-spacing:.30em` へ縮め、`font-size:clamp(8px,2.2vw,12px)`。2行折り返しを回避（`@media(max-width:740px)` 内で上書き）。

**P2-d: 左スパインに実測ティック（任意・近未来の計器感）**
- デスクトップの左通し線（spine）沿いに、セクション節点（既存 `spineNodesArr`）の脇へ等幅の小さな距離ラベル（`00`〜）を添える案。低リスクだが装飾寄りのため任意。過剰なら見送り。

---

## 3. やらないこと（却下・要注意）

- **旧 scene 群をヒーローにスクロール連動で復活させない。** これは「画面固定で延々スクロール（sticky長回し）」＝オーナーNG履歴そのもの。ヒーローは複線図の一度描き、工種はカードの前進アニメで担うG4bの構造を壊さない。P0の尺確保は**実カードの縦コンテンツ**で稼ぐ（sticky pin ではない）。
- **カラフル平行6色ケーブル／屋内配線にフェルール端子台／オレンジCD管の露出**は描かない（FACTS §3 の是正事項に反する）。相色は黒地＋赤白青の差し色テープが正。
- **ネオン発光・グリッチ・浮遊パーティクル等のSF装飾を足さない。** 「チープに見える」NG履歴に該当。近未来感は寸法注記・等幅数字・目盛り・精密フォーカス（計器語彙）で出す。
- **寸法/型式を事実の裏取り範囲を超えて書き込まない**（FACTS §5: ラング実ピッチ・親桁高さ等は未確定。相色順も現場差あり＝断定表記を避け、赤白青は「相別テープ」表現に留める）。
- **カード番号 SVC-0x の連番表示は変えない**（P0-bはDOM順のみ入替、外部識別子は据置き）。

---

## 4. 優先度サマリ
- **P0（今回の主眼）**: 施工内容を2列化＋工程順DOM入替＋`activeStep`掃引延長で、工種ステッパーの「進みすぎ」を解消し、01→04を1段ずつ前進点灯させる。
- **P1**: 死コード（旧scene群 約210行）削除／レールのHUD計器化（等幅・実測%・ロックハイライト）／カードに事実型式の注記／精密フォーカス／モバイル固定バー軽量化。
- **P2**: タグ contrast、モバイルFAQ電話番号の折返し、ロゴ副題1行化、左スパイン実測ティック（任意）。
