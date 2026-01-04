# MG開発記録

## 2026-01-04: ルール強制システム完成

### 達成事項

1. **ルール定義の一元化**
   - 唯一のルール定義: `js/simulation-engine.js`
   - 二重定義を禁止（整合性保証）

2. **検証システム構築（84項目100%）**
   - チェックリスト: `rules/rules-checklist.json` (84項目)
   - テスト: `tests/rule-tests.js` (84項目)
   - 項目数完全一致

3. **検証強制の仕組み**
   - `mg-simulation.js`経由: RuleEnforcerによる外部検証
   - `simulation-engine.js`直接: RuleValidatorによる内部自己検証
   - どの経路でも検証がスキップされない

4. **AI学習システム**
   - 5種類のAI性格: 研究商事、販売産業、堅実工業、バランス物産、積極製作所
   - シミュレーション結果から学習
   - 学習データ: `data/learned-strategies.json`

5. **行動明細表示**
   - 優勝者の各期・各行の行動を表示
   - 最優秀パターンの戦略分析可能

### データ構成（シンプル）

```
Management Game/
├── mg-simulation.js              # 統一エントリポイント
├── CLAUDE.md                     # 開発原則
├── js/
│   └── simulation-engine.js      # 唯一のルール定義
├── rules/
│   ├── rules-checklist.json      # 84項目チェックリスト
│   └── verify-rules.js           # 検証スクリプト
├── tests/
│   └── rule-tests.js             # 84項目テスト
├── data/
│   ├── ai-personalities.json     # AIの性格定義
│   └── learned-strategies.json   # 学習済み戦略
└── docs/
    ├── development-log.md        # この開発記録
    └── archive/                  # 古い記録
```

### AI学習結果（100回シミュレーション）

| 戦略 | 勝率 | 平均自己資本 | 最高自己資本 |
|------|------|-------------|-------------|
| RESEARCH_FOCUSED | 27% | ¥48 | ¥203 |
| AGGRESSIVE | 14% | ¥34 | ¥151 |
| BALANCED | 12% | ¥26 | ¥130 |
| SALES_FOCUSED | 6% | ¥15 | ¥124 |
| LOW_CHIP | 0% | ¥-44 | ¥40 |

### 重要な原則

1. **ルールは1箇所のみ** - Single Source of Truth
2. **チェックリストは毎回実行** - 1項目でも未実装なら実行拒否
3. **1年後でも確実に守られる** - 機械が自動確認

---

## 使用方法

```bash
# シミュレーション実行（検証込み）
node mg-simulation.js        # 1回
node mg-simulation.js 100    # 100回（学習データ保存）

# テスト実行
node tests/rule-tests.js
node rules/verify-rules.js
```
