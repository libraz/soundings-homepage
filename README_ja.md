# soundings Homepage

[![License](https://img.shields.io/badge/license-MIT-blue)](https://github.com/libraz/soundings-homepage/blob/main/LICENSE)
[![TypeScript](https://img.shields.io/badge/TypeScript-7-3178c6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Site](https://img.shields.io/badge/site-soundings.libraz.net-2563eb)](https://soundings.libraz.net)
[![VitePress](https://img.shields.io/badge/VitePress-1-5c73e7?logo=vite&logoColor=white)](https://vitepress.dev/)

[`soundings`](https://github.com/libraz/soundings) を公開するためのサイトです。ハードウェア MIDI 音源が実際に何をするかを、1 台ずつ実測したアーカイブを扱います。VitePress で構築し、<https://soundings.libraz.net> で公開しています。英語がルート、日本語が `/ja/` の下です。

## このサイトが見せるもの

- **アドレス検索** — 読み出しに応答したすべてのアドレスについて、電源投入直後に何を保持していたか、どの値を受け付けたか、隣のアドレスと区別できるか、各リセットが何を戻したか。
- **アドレス空間を 1 つのグリッドで** — バンクをそのブロックの上に、ブロックを 128 個のオフセットの上に、どちらの縮尺でも同じ 16 列で描きます。
- **音色とインサーションエフェクトのカタログ** — 実際にパートが移ったバンクとプログラムの組み合わせ、そして各エフェクトパラメータで音がどう変わったか。
- **制御面のブラウザエミュレータ** — 測定結果だけで動きます。記録にあることには答え、記録にないことは「未計測」と答えます。
- **刊行された文書が述べていること** — 対応する測定結果の隣に、混ぜずに並べて示します。
- **測定の背後にあるもの** — どのバイトがどのアルゴリズムを動かしているか、同定がどこまで進んだか、その読み取りが何を根拠にしているか、何があれば誤りと分かるか。そこから組んだモデルがユニットの挙動を再現している場合は、そのモデルを C++ として公開します。手書きではなくアーカイブから生成したものです。
- **測定プロトコル** — `/docs/` の下にあります。アーカイブ自身の `docs/` から `yarn sync` が複製したものなので、ここにあるページは表示用で、編集するのは隣のリポジトリです。

測定結果の読み取りは、測定ではありません。このサイトは、その二つを一つのものとして読ませません。アーカイブの `inferences/` にある主張には、アーカイブが付けた状態と、そこから組んだモデルに対する判定が、いずれもアーカイブ自身の言葉のまま付いています。実装例を公開するのは、その両方が閉じているものだけです。棄却されたモデルは棄却されたものとして示し、コードは出しません。どう同定しているかは [`/docs/identifying-an-algorithm`](https://soundings.libraz.net/ja/docs/identifying-an-algorithm) にあります。

## すべての土台になっている規則

アーカイブが典拠であり、このサイトはその並べ替えにすぎません。記録が裏付けないことは、ここでは一切主張しません。

- アドレスに仕様書由来の名前を与えることはしません。`40 11 30` は、それについて実測されたことで説明します。
- 刊行されたマニュアルが印刷している名称は、その文書が述べていることとして、版と印刷ページを添えて示します。機体が答えたことのようには示しません。
- 未計測は「未計測」として表示します。0 や空欄や空のセルで埋めることはしません。
- すべての判定・範囲・エミュレータの応答は、それを生んだ記録へのリンクを伴います。

## データ

アーカイブは vendoring していません。`yarn sync` が隣にある `soundings` のチェックアウトを読み、サイトが配信する形（アドレス 1 件につき 1 レコード、先頭 2 バイトでシャーディング）に変換して `src/data/` と `src/public/data/` へ書き出します。Cloudflare Pages のビルドはこのリポジトリしか見ないため、どちらもコミットしています。

```bash
yarn sync            # ../soundings を src/data と src/public/data に変換する
yarn sync --check    # コミット済みデータがアーカイブと食い違ったら失敗させる
SOUNDINGS_ROOT=/path/to/soundings yarn sync
```

`src/data/` の下の 2 ファイルは生成物ではなく手で書いたものです。

- `legend.json` — 出力レコード中の 1 文字コードを、アーカイブ自身の文言に対応付けます。ここに載っていない文言があると `yarn sync` は失敗します。アーカイブに新しい判定が増えたことを、取りこぼさずに気付くための仕組みです。
- `quirks.json` — エミュレータが実際に振る舞いとして再現できる挙動を機械可読にしたもので、アーカイブ側の behaviour id をキーにしています。

## 開発

```bash
# 依存関係のインストール
yarn install

# 開発サーバーの起動
yarn dev

# 本番ビルド
yarn build

# 本番ビルドのプレビュー
yarn preview

# すべてのゲート: 型、データ整合性、文書との照合、語彙の網羅、en/ja の対応、ドキュメント内リンク
yarn check

# リリース前のフルゲート: check + テスト + 本番ビルド
yarn verify

# 失敗箇所を絞り込むときの個別ゲート
yarn check:types
yarn check:data
yarn check:claims
yarn check:vocab
yarn check:i18n
yarn check:docs

# エミュレータのテスト
yarn test
```

`yarn check:types` が見るのは TypeScript のソースです。単一ファイルコンポーネントのテンプレート内部までは届きません。そこまで見るツールは、TypeScript 7 がもう公開していないエントリポイントを必要とするためです。

## デプロイ

Cloudflare Pages で <https://soundings.libraz.net> を配信しています。ビルドコマンドは `yarn build`、出力ディレクトリは `.vitepress/dist` です。プレビュー用ホストには `src/public/_headers` から `noindex` が付くので、インデックスされるのは本番のホスト名だけです。

## ライセンス

MIT です。詳細は [LICENSE](LICENSE) を参照してください。

このサイトが公開している測定結果は CC0 1.0 で、`soundings` アーカイブに帰属します。刊行された文書から読み取った内容はそのどちらでもありません。このプロジェクトが配布していない文書から読み出したものであり、アーカイブ側でそれが置かれているディレクトリの権利表記に従います。
