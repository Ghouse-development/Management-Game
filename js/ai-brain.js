/**
 * MG (Management Game) - AI Brain
 * 最強AI戦略エンジン - MG Master Brain
 * G = MQ - F を最大化するための包括的な意思決定システム
 * MQ = PQ - VQ (売上 - 変動費)
 * F = 固定費（給料、利息、減価償却、チップ維持費）
 */

const AIBrain = {
    // === AI学習データ（localStorageで永続化） ===
    learningData: null,

    // 学習データを読み込み
    loadLearningData: function() {
        if (this.learningData) return this.learningData;

        const saved = localStorage.getItem('mgAILearning');
        if (saved) {
            try {
                this.learningData = JSON.parse(saved);
            } catch (e) {
                this.learningData = this.getDefaultLearningData();
            }
        } else {
            this.learningData = this.getDefaultLearningData();
        }
        return this.learningData;
    },

    // デフォルトの学習データ
    getDefaultLearningData: function() {
        return {
            gamesPlayed: 0,
            aiWins: 0,
            // 戦略別の成績（勝率で調整）
            strategyWinRates: {
                aggressive: { wins: 0, games: 0, avgEquity: 300 },
                conservative: { wins: 0, games: 0, avgEquity: 300 },
                balanced: { wins: 0, games: 0, avgEquity: 300 },
                price_focused: { wins: 0, games: 0, avgEquity: 300 },
                tech_focused: { wins: 0, games: 0, avgEquity: 300 },
                unpredictable: { wins: 0, games: 0, avgEquity: 300 }
            },
            // 入札価格の学習（市場別の成功価格帯）
            bidPriceHistory: {
                avgWinPrice: 28,
                minWinPrice: 20,
                maxWinPrice: 35,
                recentPrices: []
            },
            // 投資タイミングの学習
            investmentSuccess: {
                period2Education: { count: 0, successRate: 0.5 },
                period2Research: { count: 0, successRate: 0.5 },
                earlyWorker: { count: 0, successRate: 0.5 },
                earlySalesman: { count: 0, successRate: 0.5 }
            },
            // 戦略別の研究チップ目標（学習で調整）
            researchChipTargets: {
                aggressive: 4,
                conservative: 2,
                balanced: 3,
                price_focused: 5,
                tech_focused: 4,
                unpredictable: 3
            },
            // 最適safetyBuffer（学習で調整）
            optimalSafetyBuffer: {
                aggressive: 20,
                conservative: 80,
                balanced: 40,
                price_focused: 30,
                tech_focused: 35,
                unpredictable: 25
            }
        };
    },

    // 学習データを保存
    saveLearningData: function() {
        if (this.learningData) {
            localStorage.setItem('mgAILearning', JSON.stringify(this.learningData));
        }
    },

    // ============================================
    // 🔥 AI感情システム - 入札負けの悔しさ、勝利への執着
    // ============================================
    emotions: {},  // companyIndex => emotionState

    // 感情状態を初期化
    initEmotions: function(companyIndex) {
        if (!this.emotions[companyIndex]) {
            this.emotions[companyIndex] = {
                frustration: 0,        // 悔しさ（0-100）入札負けで増加
                competitiveDrive: 50,  // 競争心（0-100）基本値50
                revengeTargets: {},    // 復讐対象 {companyIndex: intensity}
                consecutiveLosses: 0,  // 連続入札負け数
                lastBidResult: null,   // 前回入札結果 'won' | 'lost' | null
                victoryHunger: 50,     // 勝利への渇望（0-100）
                mood: 'neutral'        // 'frustrated' | 'confident' | 'desperate' | 'neutral'
            };
        }
        return this.emotions[companyIndex];
    },

    // 入札結果から感情を更新
    updateEmotionsFromBidResult: function(companyIndex, won, winnerIndex, bidPrice, winningPrice) {
        const e = this.initEmotions(companyIndex);
        const company = gameState.companies[companyIndex];

        if (won) {
            // 勝利！悔しさリセット、自信UP
            e.consecutiveLosses = 0;
            e.frustration = Math.max(0, e.frustration - 30);
            e.competitiveDrive = Math.min(100, e.competitiveDrive + 5);
            e.lastBidResult = 'won';
            e.mood = 'confident';
            console.log(`[感情] ${company.name}「やった！落札成功！」(自信UP)`);
        } else {
            // 負け...悔しさ増加
            e.consecutiveLosses++;
            e.frustration = Math.min(100, e.frustration + 15 + e.consecutiveLosses * 5);
            e.lastBidResult = 'lost';

            // 勝者への復讐心
            if (winnerIndex !== undefined && winnerIndex !== companyIndex) {
                e.revengeTargets[winnerIndex] = (e.revengeTargets[winnerIndex] || 0) + 20;
                const winner = gameState.companies[winnerIndex];
                console.log(`[感情] ${company.name}「くっ...${winner?.name || '奴'}に負けた...次は絶対勝つ！」(復讐心+20)`);
            }

            // 連続負けで気分変化
            if (e.consecutiveLosses >= 3) {
                e.mood = 'desperate';
                e.victoryHunger = Math.min(100, e.victoryHunger + 20);
                console.log(`[感情] ${company.name}「もう後がない...なんとしても次は！」(必死モード)`);
            } else {
                e.mood = 'frustrated';
            }

            // 僅差で負けた場合は特に悔しい
            if (winningPrice && bidPrice && (winningPrice - bidPrice) <= 2) {
                e.frustration = Math.min(100, e.frustration + 10);
                console.log(`[感情] ${company.name}「あと${winningPrice - bidPrice}円だったのに...！」(激悔)`);
            }
        }

        // 勝利への渇望を更新
        const rankings = this.getRankings();
        const myRank = rankings.findIndex(r => r.index === companyIndex) + 1;
        if (myRank > 1) {
            e.victoryHunger = Math.min(100, 50 + (myRank - 1) * 10 + e.consecutiveLosses * 5);
        }
    },

    // 現在の順位を取得
    getRankings: function() {
        return gameState.companies
            .map((c, i) => ({ index: i, equity: c.equity, name: c.name }))
            .sort((a, b) => b.equity - a.equity);
    },

    // 感情に基づく入札価格調整
    // 【v8修正】感情で入札価格を上げるのは愚策 → 冷静な判断を維持
    getEmotionalBidAdjustment: function(companyIndex, baseBidPrice, targetCompanyIndex) {
        const e = this.initEmotions(companyIndex);
        let adjustment = 0;
        const company = gameState.companies[companyIndex];

        // 【合理的感情システム】
        // - 悔しさ → 入札価格を上げない（利益を守る）
        // - 必死モード → むしろ安く売って在庫回転を優先
        // - 自信 → 現状維持（冷静な判断）

        // 必死モードでは安く売って回転を優先（在庫リスク回避）
        if (e.mood === 'desperate' && e.consecutiveLosses >= 3) {
            adjustment -= 1;  // 1円安くして勝率UP
            console.log(`[冷静判断] ${company.name}: 連続負け${e.consecutiveLosses}回、1円引きで確実に落札`);
        }

        // 自信がある時も現状維持（無駄に高くしない）
        if (e.mood === 'confident') {
            adjustment = 0;
        }

        // 悔しさは記録するが、価格に反映しない（学習用データとして保持）
        if (e.frustration > 50) {
            console.log(`[感情抑制] ${company.name}: 悔しさ${e.frustration}だが冷静に判断（価格維持）`);
        }

        return adjustment;
    },

    // 感情を考慮した攻撃性を取得
    getEmotionalAggressiveness: function(companyIndex) {
        const e = this.initEmotions(companyIndex);
        let aggro = 0.5;  // 基本値

        // 悔しさで攻撃的に
        aggro += e.frustration / 200;  // 最大+0.5

        // 必死モードで更に攻撃的
        if (e.mood === 'desperate') {
            aggro += 0.2;
        }

        // 勝利渇望で攻撃的
        aggro += (e.victoryHunger - 50) / 200;  // ±0.25

        return Math.max(0.2, Math.min(1.0, aggro));
    },

    // 期末に感情をリセット（少し残す）
    coolDownEmotions: function(companyIndex) {
        const e = this.emotions[companyIndex];
        if (!e) return;

        e.frustration = Math.floor(e.frustration * 0.5);  // 半減
        e.victoryHunger = Math.max(50, e.victoryHunger - 10);
        e.consecutiveLosses = 0;
        e.mood = 'neutral';

        // 復讐心も少し冷める
        for (const target in e.revengeTargets) {
            e.revengeTargets[target] = Math.floor(e.revengeTargets[target] * 0.7);
            if (e.revengeTargets[target] < 5) {
                delete e.revengeTargets[target];
            }
        }
    },

    // ゲーム終了時に学習（決算後に呼び出す）
    learnFromGameResult: function(gameResults) {
        const data = this.loadLearningData();
        data.gamesPlayed++;

        // 勝者を特定（プレイヤー以外で最高自己資本）
        const aiCompanies = gameResults.filter((r, i) => i > 0);
        const winner = gameResults.reduce((max, r) => r.equity > max.equity ? r : max, gameResults[0]);
        const aiWinner = aiCompanies.reduce((max, r) => r.equity > max.equity ? r : max, aiCompanies[0]);

        // プレイヤーが負けた場合、AIが勝利
        if (winner !== gameResults[0]) {
            data.aiWins++;
        }

        // 戦略別成績を更新
        aiCompanies.forEach(result => {
            const strategy = result.strategy;
            if (data.strategyWinRates[strategy]) {
                data.strategyWinRates[strategy].games++;
                if (result === aiWinner) {
                    data.strategyWinRates[strategy].wins++;
                }
                // 平均自己資本を更新（移動平均）
                const prevAvg = data.strategyWinRates[strategy].avgEquity;
                data.strategyWinRates[strategy].avgEquity =
                    Math.round(prevAvg * 0.7 + result.equity * 0.3);
            }
        });

        // 勝率が高い戦略の研究チップ目標を参考に調整
        Object.keys(data.strategyWinRates).forEach(strategy => {
            const stats = data.strategyWinRates[strategy];
            if (stats.games >= 3) {
                const winRate = stats.wins / stats.games;
                // 勝率が高ければ研究チップ目標を維持/増加
                if (winRate > 0.5) {
                    data.researchChipTargets[strategy] = Math.min(5,
                        data.researchChipTargets[strategy] + 0.2);
                } else if (winRate < 0.3) {
                    // 勝率が低ければ戦略を調整
                    data.optimalSafetyBuffer[strategy] = Math.max(10,
                        data.optimalSafetyBuffer[strategy] - 5);
                }
            }
        });

        this.saveLearningData();
        console.log('[AI学習] ゲーム結果を学習:', data.gamesPlayed + 'ゲーム目');
    },

    // 学習に基づく研究チップ目標を取得
    getResearchChipTarget: function(strategy) {
        const data = this.loadLearningData();
        return Math.round(data.researchChipTargets[strategy] || 3);
    },

    // 学習に基づくsafetyBufferを取得
    getOptimalSafetyBuffer: function(strategy) {
        const data = this.loadLearningData();
        return data.optimalSafetyBuffer[strategy] || 40;
    },

    // 入札価格を学習から推奨
    getRecommendedBidPrice: function(market) {
        const data = this.loadLearningData();
        const priceData = data.bidPriceHistory;

        // 学習データがあれば参考に
        if (priceData.recentPrices.length >= 5) {
            const avgRecent = priceData.recentPrices.slice(-10).reduce((a, b) => a + b, 0)
                            / Math.min(10, priceData.recentPrices.length);
            return Math.round(avgRecent);
        }
        return 28; // デフォルト
    },

    // 入札成功を記録（学習用）
    recordBidSuccess: function(price, won) {
        const data = this.loadLearningData();
        if (won) {
            data.bidPriceHistory.recentPrices.push(price);
            if (data.bidPriceHistory.recentPrices.length > 50) {
                data.bidPriceHistory.recentPrices.shift();
            }
            data.bidPriceHistory.avgWinPrice =
                Math.round(data.bidPriceHistory.recentPrices.reduce((a, b) => a + b, 0)
                / data.bidPriceHistory.recentPrices.length);
            data.bidPriceHistory.minWinPrice = Math.min(price, data.bidPriceHistory.minWinPrice);
            data.bidPriceHistory.maxWinPrice = Math.max(price, data.bidPriceHistory.maxWinPrice);
        }
        this.saveLearningData();
    },

    // 学習統計を取得
    getLearningStats: function() {
        const data = this.loadLearningData();
        return {
            gamesPlayed: data.gamesPlayed,
            aiWins: data.aiWins,
            winRate: data.gamesPlayed > 0 ? (data.aiWins / data.gamesPlayed * 100).toFixed(1) + '%' : '0%',
            avgWinPrice: data.bidPriceHistory.avgWinPrice,
            strategyRankings: Object.entries(data.strategyWinRates)
                .map(([name, stats]) => ({
                    name,
                    winRate: stats.games > 0 ? (stats.wins / stats.games * 100).toFixed(1) : 0,
                    avgEquity: stats.avgEquity
                }))
                .sort((a, b) => b.avgEquity - a.avgEquity)
        };
    },

    // === 勝利への道筋を計算 ===
    calculatePathToVictory: function(company, companyIndex) {
        const period = gameState.currentPeriod;
        const rivals = gameState.companies.filter((c, i) => i !== companyIndex && i !== 0);
        const myEquity = company.equity;
        const maxRivalEquity = Math.max(...rivals.map(c => c.equity));
        const equityGap = maxRivalEquity - myEquity;

        // 勝つために必要なG（利益）
        const periodsRemaining = 5 - period;
        const targetEquityGain = equityGap + 30; // トップを超えるために必要な増加
        const targetGPerPeriod = periodsRemaining > 0 ? targetEquityGain / periodsRemaining : targetEquityGain;

        // 現在の能力で達成可能なMQ
        const mfgCapacity = getManufacturingCapacity(company);
        const salesCapacity = getSalesCapacity(company);
        const maxPossibleSales = Math.min(mfgCapacity, salesCapacity);
        const avgPrice = 28 + (company.chips.research || 0) * 2; // 研究チップ効果
        const avgVQ = 15; // 平均変動費（材料10 + 製造2 + 仕掛2 + 販売1）
        const estimatedMQPerCycle = maxPossibleSales * (avgPrice - avgVQ);

        // 行数から見た販売回数（15行で約3-4回販売）
        const rowsPerSale = 4; // 材料→生産→生産→販売
        const rowsRemaining = gameState.maxRows - (company.currentRow || 1);
        const possibleSalesCycles = Math.floor(rowsRemaining / rowsPerSale);

        // 達成可能なMQ合計
        const achievableMQ = estimatedMQPerCycle * possibleSalesCycles;

        // 固定費見込み
        const periodFixedCost = calculateFixedCost(company);

        // 勝利確率スコア（0-100）
        const canWin = achievableMQ - periodFixedCost > targetGPerPeriod;
        const victoryScore = Math.min(100, Math.max(0,
            50 + (achievableMQ - periodFixedCost - targetGPerPeriod) / 2));

        return {
            targetGPerPeriod,
            estimatedMQPerCycle,
            possibleSalesCycles,
            achievableMQ,
            periodFixedCost,
            equityGap,
            canWin,
            victoryScore,
            needsAggression: equityGap > 50 || victoryScore < 40
        };
    },

    // === 投資のROI（投資収益率）を計算 ===
    calculateInvestmentROI: function(company, investmentType) {
        const period = gameState.currentPeriod;
        const periodsRemaining = 5 - period;
        const rowsRemaining = gameState.maxRows - (company.currentRow || 1);
        const salesCycles = Math.floor(rowsRemaining / 4);

        const roi = {
            research: {
                cost: period === 2 ? 20 : 40,
                benefit: 2 * salesCycles * 2, // 価格競争力+2 × 販売回数 × 約2個
                longTermValue: periodsRemaining * 20, // 次期以降の価値
                priority: periodsRemaining >= 2 ? 'high' : 'low'
            },
            education: {
                cost: period === 2 ? 20 : 40,
                benefit: (1 + 1) * salesCycles * 13, // 製造+1、販売+1 × 販売回数 × MQ/個
                longTermValue: periodsRemaining * 30,
                // 2期は2枚以上購入しないと期末に没収されて無駄
                // 【v8修正】教育は1枚で十分（2枚目は効果なし）
                priority: company.chips.education < 1 ? 'highest' : 'low'
            },
            advertising: {
                cost: period === 2 ? 20 : 40,
                benefit: 2 * company.salesmen * salesCycles * 13, // 販売+2/セールスマン
                longTermValue: periodsRemaining * 15,
                priority: company.salesmen >= 2 ? 'high' : 'medium'
            },
            computer: {
                cost: 15,
                benefit: 1 * salesCycles * 13, // 製造+1
                longTermValue: periodsRemaining * 10,
                priority: !company.chips.computer ? 'medium' : 'none'
            },
            worker: {
                cost: 5 + (BASE_SALARY_BY_PERIOD[period] || 22) * 1.5, // 採用費 + 給料
                benefit: salesCycles * 13, // 製造能力増加（機械があれば）
                longTermValue: periodsRemaining * 20,
                priority: company.workers < company.machines.length ? 'high' : 'low'
            },
            salesman: {
                cost: 5 + (BASE_SALARY_BY_PERIOD[period] || 22) * 1.5,
                benefit: 2 * salesCycles * 13, // 販売能力+2
                longTermValue: periodsRemaining * 25,
                priority: getSalesCapacity(company) < getManufacturingCapacity(company) ? 'high' : 'medium'
            },
            machine_small: {
                cost: 50,
                benefit: 1 * salesCycles * 13, // 製造能力+1
                longTermValue: periodsRemaining * 15,
                priority: period <= 3 ? 'medium' : 'low'
            },
            machine_large: {
                cost: 100,
                benefit: 4 * salesCycles * 13, // 製造能力+4
                longTermValue: periodsRemaining * 50,
                priority: period <= 2 && company.cash > 200 ? 'high' : 'low'
            },
            nextPeriodChip: {
                cost: 20, // 通常価格
                benefit: 20, // 次期に特急価格(40円)で買うより20円得
                longTermValue: 40,
                priority: period >= 3 ? 'high' : 'none'
            }
        };

        if (investmentType) {
            return roi[investmentType];
        }
        return roi;
    },

    // === キャッシュフロー予測 ===
    forecastCashFlow: function(company, rows = 5) {
        const period = gameState.currentPeriod;
        const rowsRemaining = gameState.maxRows - (company.currentRow || 1);
        const actualRows = Math.min(rows, rowsRemaining);

        // 期末支払い（必ず払う）
        const mustPay = calculatePeriodPayment(company);

        // 予想収入（販売回数 × 平均価格 × 平均個数）
        const salesCapacity = getSalesCapacity(company);
        const mfgCapacity = getManufacturingCapacity(company);
        const avgSalesPerCycle = Math.min(salesCapacity, company.products + mfgCapacity);
        const avgPrice = 28 + (company.chips.research || 0) * 2;
        const salesCyclesInRows = Math.floor(actualRows / 4);
        const expectedIncome = salesCyclesInRows * avgSalesPerCycle * avgPrice;

        // 予想支出（材料、生産）
        const materialCost = salesCyclesInRows * mfgCapacity * 12; // 平均材料費
        const productionCost = salesCyclesInRows * mfgCapacity * 2; // 製造費
        const expectedExpense = materialCost + productionCost;

        // リスクカード考慮（1/5で引く、平均損失20円）
        const riskExpectedLoss = company.chips.insurance ? 5 : 15;

        // 最低安全現金
        const safetyBuffer = mustPay + riskExpectedLoss + 20;

        // 投資可能額
        const availableForInvestment = company.cash + expectedIncome - expectedExpense - safetyBuffer;

        return {
            mustPay,
            expectedIncome,
            expectedExpense,
            riskExpectedLoss,
            safetyBuffer,
            availableForInvestment,
            isSafe: company.cash > safetyBuffer,
            isDangerous: company.cash < mustPay,
            canInvest: availableForInvestment > 50
        };
    },

    // === 競合分析 ===
    analyzeCompetitors: function(company, companyIndex) {
        const rivals = gameState.companies.filter((c, i) => i !== companyIndex);

        const analysis = rivals.map((rival, i) => {
            const actualIndex = i >= companyIndex ? i + 1 : i;
            return {
                index: actualIndex,
                name: rival.name,
                equity: rival.equity,
                cash: rival.cash,
                products: rival.products,
                researchChips: rival.chips.research || 0,
                salesCapacity: getSalesCapacity(rival),
                mfgCapacity: getManufacturingCapacity(rival),
                threat: this.calculateThreatLevel(rival, company),
                canSellNow: rival.products > 0 && getSalesCapacity(rival) > 0,
                isStruggling: rival.cash < calculatePeriodPayment(rival)
            };
        });

        // 脅威度でソート
        analysis.sort((a, b) => b.threat - a.threat);

        const leader = analysis.reduce((max, r) => r.equity > max.equity ? r : max, analysis[0]);
        const mostDangerous = analysis[0];
        const strugglers = analysis.filter(r => r.isStruggling);

        return {
            rivals: analysis,
            leader,
            mostDangerous,
            strugglers,
            averageResearch: analysis.reduce((sum, r) => sum + r.researchChips, 0) / analysis.length,
            averageEquity: analysis.reduce((sum, r) => sum + r.equity, 0) / analysis.length,
            myRank: gameState.companies.filter(c => c.equity > company.equity).length + 1
        };
    },

    // === 脅威レベル計算 ===
    calculateThreatLevel: function(rival, myCompany) {
        let threat = 0;

        // 自己資本で上回られている
        if (rival.equity > myCompany.equity) threat += 30;

        // 研究チップで上回られている（入札で負ける）
        if (rival.chips.research > myCompany.chips.research) threat += 20;

        // 販売能力が高い（売上を稼げる）
        if (getSalesCapacity(rival) > getSalesCapacity(myCompany)) threat += 15;

        // 製品を持っている（すぐ売れる）
        if (rival.products > 3) threat += 10;

        // 現金が豊富（投資できる）
        if (rival.cash > myCompany.cash + 50) threat += 10;

        // 次期チップを持っている
        const rivalNextChips = (rival.nextPeriodChips?.research || 0) +
                               (rival.nextPeriodChips?.education || 0) +
                               (rival.nextPeriodChips?.advertising || 0);
        if (rivalNextChips > 2) threat += 5;

        return threat;
    },

    // === 最適な行動を決定 ===
    decideOptimalAction: function(company, companyIndex) {
        const cashFlow = this.forecastCashFlow(company);
        const competitors = this.analyzeCompetitors(company, companyIndex);
        const victory = this.calculatePathToVictory(company, companyIndex);
        const roi = this.calculateInvestmentROI(company);

        const period = gameState.currentPeriod;
        const mfgCapacity = getManufacturingCapacity(company);
        const salesCapacity = getSalesCapacity(company);

        // === 緊急モード判定 ===
        if (cashFlow.isDangerous) {
            return { action: 'SURVIVAL', reason: '給料が払えない危機', priority: 'critical' };
        }

        // === 5期目標モード ===
        if (period === 5) {
            const totalInv = company.materials + company.wip + company.products;
            const nextChips = (company.nextPeriodChips?.research || 0) +
                              (company.nextPeriodChips?.education || 0) +
                              (company.nextPeriodChips?.advertising || 0);

            if (nextChips < 3) {
                return { action: 'BUY_NEXT_CHIP', reason: '5期目標:チップ不足', priority: 'high' };
            }
            if (totalInv < 10) {
                return { action: 'BUILD_INVENTORY', reason: '5期目標:在庫不足', priority: 'high' };
            }
            if (company.products > 0 && totalInv > 10) {
                return { action: 'SELL_SURPLUS', reason: '5期:余剰製品を売却', priority: 'medium' };
            }
        }

        // === 勝利への道筋に基づく判断 ===
        if (victory.needsAggression) {
            // 負けている場合は攻めの選択
            if (company.chips.research < competitors.averageResearch && cashFlow.canInvest) {
                return { action: 'BUY_RESEARCH', reason: '価格競争力で負けている', priority: 'high' };
            }
            if (company.products > 0 && salesCapacity > 0) {
                return { action: 'SELL_AGGRESSIVE', reason: 'MQを稼ぐために積極販売', priority: 'high' };
            }
        }

        // === 通常の最適行動 ===
        // 1. 販売できるなら販売（MQを稼ぐ基本）
        if (company.products >= Math.ceil(salesCapacity * 0.7) && salesCapacity > 0) {
            return { action: 'SELL', reason: '製品があるので販売', priority: 'normal' };
        }

        // 2. 生産できるなら生産
        if ((company.materials > 0 || company.wip > 0) && mfgCapacity > 0) {
            return { action: 'PRODUCE', reason: '材料/仕掛を製品に変換', priority: 'normal' };
        }

        // 3. 材料が少なければ購入
        if (company.materials < mfgCapacity && cashFlow.isSafe) {
            return { action: 'BUY_MATERIALS', reason: '材料補充', priority: 'normal' };
        }

        // 4. 投資判断（ROIベース）
        if (cashFlow.canInvest && period <= 4) {
            const bestInvestment = this.findBestInvestment(company, roi, competitors);
            if (bestInvestment) {
                return { action: 'INVEST', investment: bestInvestment.type, reason: bestInvestment.reason, priority: 'low' };
            }
        }

        return { action: 'WAIT', reason: '最適な行動なし', priority: 'none' };
    },

    // === 最良の投資を見つける ===
    findBestInvestment: function(company, roi, competitors) {
        const period = gameState.currentPeriod;
        const candidates = [];
        // 2期は2枚以上購入しないと期末に没収されて無駄
        const minEduChips = period === 2 ? 2 : 1;

        // 教育チップ（最優先：効率が最高）
        if (company.chips.education < minEduChips && roi.education.priority !== 'none') {
            candidates.push({ type: 'education', score: 100, reason: '効率投資（製造+1、販売+1）' });
        }

        // 研究チップ（競合より少ない場合）
        if (company.chips.research < competitors.averageResearch && roi.research.priority !== 'none') {
            candidates.push({ type: 'research', score: 90, reason: '価格競争力強化' });
        }

        // 次期チップ（3期以降）
        if (period >= 3) {
            const nextChips = (company.nextPeriodChips?.research || 0) +
                              (company.nextPeriodChips?.education || 0) +
                              (company.nextPeriodChips?.advertising || 0);
            if (nextChips < 3) {
                candidates.push({ type: 'nextPeriodChip', score: 85, reason: '次期用チップ（コスト削減）' });
            }
        }

        // コンピュータチップ
        if (!company.chips.computer && period <= 3) {
            candidates.push({ type: 'computer', score: 60, reason: '製造能力+1' });
        }

        // 広告チップ（セールスマン2人以上なら）
        if (company.salesmen >= 2 && (company.chips.advertising || 0) < company.salesmen) {
            candidates.push({ type: 'advertising', score: 70, reason: '販売能力強化' });
        }

        // ワーカー採用
        if (company.workers < company.machines.length && period <= 3) {
            candidates.push({ type: 'worker', score: 55, reason: 'ワーカー不足解消' });
        }

        // セールスマン採用
        if (getSalesCapacity(company) < getManufacturingCapacity(company) && period <= 4) {
            candidates.push({ type: 'salesman', score: 65, reason: '販売能力不足解消' });
        }

        // スコアでソートして最高を返す
        candidates.sort((a, b) => b.score - a.score);
        return candidates[0] || null;
    },

    // === 入札価格を戦略的に決定 ===
    calculateStrategicBidPrice: function(company, market, companyIndex) {
        const competitors = this.analyzeCompetitors(company, companyIndex);
        const cashFlow = this.forecastCashFlow(company);
        const period = gameState.currentPeriod;

        const basePrice = market.sellPrice;
        const myCompetitiveness = (company.chips.research || 0) * 2;

        // === 1. 生存モード（給料が払えない） ===
        if (cashFlow.isDangerous) {
            const neededForSurvival = cashFlow.mustPay - company.cash;
            const minPriceForSurvival = Math.ceil(neededForSurvival / company.products);
            // 生存モードでも最低25円は確保（VQ≒15なのでMQ=10は必要）
            // G = MQ - F を考慮: 赤字覚悟でも変動費を下回る価格は絶対NG
            const minProfitablePrice = 25; // 材料13+投入1+完成1=15、MQ=10円確保
            return Math.max(minProfitablePrice, Math.min(minPriceForSurvival, Math.round(basePrice * 0.70)));
        }

        // === 2. ブロッキングモード（ライバルを妨害） ===
        const canBlock = company.strategy === 'aggressive' &&
                         company.cash > cashFlow.mustPay + 80;
        const shouldBlock = competitors.rivals.some(r =>
            r.canSellNow && r.threat > 50 && r.isStruggling);

        if (canBlock && shouldBlock && Math.random() > 0.6) {
            // ライバルより安くして販売機会を奪う
            const blockPrice = Math.max(26, Math.round(basePrice * 0.75));
            return blockPrice;
        }

        // === 3. 独占モード（他社が全く売れない状況） ===
        // 他社全員が製品0個または販売員0人なら独占状態
        const othersCanSell = gameState.companies.filter((c, i) => {
            if (i === companyIndex) return false;
            return c.products > 0 && c.salesmen > 0;
        });
        const isMonopoly = othersCanSell.length === 0;

        if (isMonopoly) {
            // 独占時のみ高価格が可能（35-40円、上限の88-100%）
            const monopolyMultiplier = 0.88 + Math.random() * 0.12;
            return Math.min(basePrice, Math.round(basePrice * monopolyMultiplier));
        }

        // === 4. 通常競争モード（26-30円目安） ===
        // 市場上限40円の場合: 65-75%で26-30円になる
        let priceMultiplier;
        switch (company.strategy) {
            case 'aggressive':
                priceMultiplier = 0.62 + Math.random() * 0.08; // 62-70% → 25-28円
                break;
            case 'conservative':
                priceMultiplier = 0.70 + Math.random() * 0.08; // 70-78% → 28-31円
                break;
            case 'price_focused':
                priceMultiplier = 0.60 + Math.random() * 0.08; // 60-68% → 24-27円
                break;
            case 'tech_focused':
                priceMultiplier = 0.68 + Math.random() * 0.08; // 68-76% → 27-30円
                break;
            case 'unpredictable':
                priceMultiplier = 0.58 + Math.random() * 0.18; // 58-76% → 23-30円
                break;
            default:
                priceMultiplier = 0.65 + Math.random() * 0.10; // 65-75% → 26-30円
        }

        // 競争力（研究チップ）が高ければ少し価格を上げられる
        if (myCompetitiveness > competitors.averageResearch * 2) {
            priceMultiplier += 0.03; // 控えめに+3%
        }

        const price = Math.floor(basePrice * priceMultiplier);
        return Math.max(26, Math.min(price, basePrice));
    },

    // ============================================
    // ⚡ 特急チップROI計算
    // ============================================
    // 特急チップ(40円+1行)を使うべきか、それとも安く売った方が得か判断

    shouldUseExpressChip: function(company, chipType, companyIndex) {
        const EXPRESS_COST = 40;
        const EXPRESS_ROWS = 1;  // 特急購入で1行消費

        const rowsRemaining = 20 - (company.currentRow || 1);
        const salesCapacity = getSalesCapacity(company);
        const mfgCapacity = getManufacturingCapacity(company);

        // 残り行数が少なすぎる場合は特急しない
        if (rowsRemaining < 3) {
            return { shouldUse: false, reason: '残り行数が少なすぎる' };
        }

        // 残り販売可能数を推定（残り行数の半分程度が販売に使えると仮定）
        const estimatedSalesRows = Math.floor((rowsRemaining - EXPRESS_ROWS) / 2);
        const maxSellableQty = estimatedSalesRows * salesCapacity;

        // チップ種類別のROI計算
        let expectedBenefit = 0;
        let breakEvenQty = 0;

        switch (chipType) {
            case 'research':
                // 研究チップ: 価格競争力+2円
                const priceAdvantage = 2;
                breakEvenQty = Math.ceil(EXPRESS_COST / priceAdvantage);  // 20個
                expectedBenefit = maxSellableQty * priceAdvantage;

                if (maxSellableQty < breakEvenQty) {
                    return {
                        shouldUse: false,
                        reason: `残り${maxSellableQty}個しか売れない（回収に${breakEvenQty}個必要）`,
                        alternative: '40円安く売った方が効果的'
                    };
                }
                break;

            case 'education':
                // 教育チップ: 製造+1、販売+1
                // 追加1個あたりの限界利益（MQ）を15円と仮定
                const mqPerUnit = 15;
                const additionalUnits = estimatedSalesRows;  // 残り行で追加で作れる/売れる数
                expectedBenefit = additionalUnits * mqPerUnit;
                breakEvenQty = Math.ceil(EXPRESS_COST / mqPerUnit);  // 約3個

                if (additionalUnits < breakEvenQty) {
                    return {
                        shouldUse: false,
                        reason: `追加${additionalUnits}個では回収不可（${breakEvenQty}個必要）`,
                        alternative: '通常購入か次期用購入が効果的'
                    };
                }
                break;

            case 'advertising':
                // 広告チップ: 販売能力+2（セールスマンがいれば）
                if (company.salesmen === 0) {
                    return { shouldUse: false, reason: 'セールスマンがいない' };
                }
                const additionalSales = Math.min(2, company.products) * estimatedSalesRows;
                const avgMQ = 12;
                expectedBenefit = additionalSales * avgMQ;
                breakEvenQty = Math.ceil(EXPRESS_COST / avgMQ);

                if (additionalSales < breakEvenQty) {
                    return {
                        shouldUse: false,
                        reason: `追加販売${additionalSales}個では回収不可`,
                        alternative: '特急より安売りが効果的'
                    };
                }
                break;
        }

        // 特急 vs 安売りの比較
        // 40円安く売る = 販売能力分の値引き効果
        const discountAlternative = EXPRESS_COST;  // 40円値引きに相当

        if (expectedBenefit <= discountAlternative * 1.2) {  // 1.2倍以上の効果がないなら安売りの方が確実
            return {
                shouldUse: false,
                reason: `期待利益${expectedBenefit}円 ≒ 40円値引き効果`,
                alternative: '安く売った方が確実に効果的'
            };
        }

        return {
            shouldUse: true,
            reason: `期待利益${expectedBenefit}円 > 投資${EXPRESS_COST}円`,
            expectedROI: Math.round((expectedBenefit / EXPRESS_COST - 1) * 100)
        };
    },

    // ============================================
    // 📋 リスクカード認識システム
    // ============================================
    // 全64枚のリスクカードを把握し、予防策を提案

    RISK_KNOWLEDGE: {
        // === 損失系（予防可能） ===
        materialLoss: {
            cards: ['倉庫火災'],
            count: 2,
            prevention: 'warehouse_materials',  // 材料倉庫
            insuranceHelps: true,
            description: '材料全て失う'
        },
        productLoss: {
            cards: ['盗難発見'],
            count: 2,
            prevention: 'warehouse_products',  // 製品倉庫
            insuranceHelps: true,
            lossAmount: 2,
            description: '製品2個失う'
        },
        excessInventory: {
            cards: ['不良在庫発生'],
            count: 2,
            prevention: 'keep_inventory_under_20',
            threshold: 20,
            description: '在庫20個超過分失う'
        },

        // === チップ返却系（複数持つことで対策） ===
        chipLoss: {
            research: { cards: ['研究開発失敗'], count: 3 },
            advertising: { cards: ['広告政策失敗'], count: 2 },
            education: { cards: ['教育失敗'], count: 2 },
            description: 'チップ1枚返却'
        },

        // === 現金損失系（現金バッファで対策） ===
        cashLoss: {
            cards: ['得意先倒産', 'クレーム発生', '縁故採用', 'コンピュータートラブル',
                    '設計トラブル発生', '機械故障'],
            maxLoss: 30,  // 得意先倒産が最大
            avgLoss: 8,
            description: '現金を失う'
        },

        // === 行動制限系（在庫管理で対策） ===
        salesBlock: {
            cards: ['消費者運動発生'],
            count: 2,
            mitigation: 'dont_hold_too_many_products',
            description: '販売不可'
        },
        productionBlock: {
            cards: ['労災発生'],
            count: 2,
            mitigation: 'dont_hold_too_much_wip',
            description: '生産不可'
        },

        // === 休み系（行数ロス） ===
        skipTurns: {
            cards: ['ストライキ発生', '長期労務紛争', '社長、病気で倒れる'],
            maxSkip: 2,
            totalCards: 6,
            description: '1-2回休み'
        },

        // === 人員系 ===
        retirement: {
            cards: ['ワーカー退職', 'セールスマン退職'],
            count: 4,
            mitigation: 'keep_extra_personnel',
            description: '人員が減る'
        },

        // === チャンスカード（活用！） ===
        opportunities: {
            researchSuccess: { cards: ['研究開発成功'], count: 6, benefit: '研究チップ1枚につき2個まで32円販売（販売能力内、最高5個、仕入れ不可）' },
            educationSuccess: { cards: ['教育成功'], count: 2, benefit: '教育チップで32円販売（販売能力内、最高5個、仕入れ可）' },
            advertisingSuccess: { cards: ['広告成功'], count: 3, benefit: '広告チップ1枚につき2個まで独占販売（最高5個、仕入れ可）' },
            exclusiveSale: { cards: ['商品の独占販売'], count: 3, benefit: 'セールスマン1人につき2個まで32円販売（最高5個、仕入れ可）' },
            specialService: { cards: ['特別サービス'], count: 2, benefit: '材料1個10円で5個まで or 広告20円で2個まで' },
            commonPurchase: { cards: ['各社共通'], count: 2, benefit: '全社が3個まで12円で購入可' }
        }
    },

    // === リスク対策状況を分析 ===
    analyzeRiskProtection: function(company) {
        const protection = {
            score: 0,
            maxScore: 100,
            vulnerabilities: [],
            recommendations: []
        };

        // 保険チェック
        if (company.chips.insurance) {
            protection.score += 15;
        } else {
            protection.vulnerabilities.push('保険未加入（火災・盗難で損失大）');
            protection.recommendations.push({ type: 'insurance', priority: 'medium', reason: '火災・盗難対策' });
        }

        // 材料倉庫チェック
        if (company.warehouses > 0 && company.warehouseLocation === 'materials') {
            protection.score += 10;
        } else if (company.materials > 3) {
            protection.vulnerabilities.push('材料が火災リスクにさらされている');
            protection.recommendations.push({ type: 'warehouse_materials', priority: 'low', reason: '火災保護' });
        }

        // 製品倉庫チェック
        if (company.warehouses > 0 && company.warehouseLocation === 'products') {
            protection.score += 10;
        } else if (company.warehouses >= 2) {
            protection.score += 10;  // 両方持っている
        } else if (company.products > 3) {
            protection.vulnerabilities.push('製品が盗難リスクにさらされている');
            protection.recommendations.push({ type: 'warehouse_products', priority: 'low', reason: '盗難保護' });
        }

        // 在庫過多チェック
        const totalInventory = company.materials + company.wip + company.products;
        if (totalInventory > 20) {
            protection.vulnerabilities.push(`在庫${totalInventory}個（20超過で不良在庫リスク）`);
            protection.recommendations.push({ type: 'reduce_inventory', priority: 'high', reason: '不良在庫対策' });
        } else if (totalInventory <= 15) {
            protection.score += 10;
        }

        // 現金バッファチェック
        const periodEndCost = calculatePeriodPayment(company);
        const cashBuffer = company.cash - periodEndCost;
        if (cashBuffer >= 50) {
            protection.score += 15;
        } else if (cashBuffer >= 30) {
            protection.score += 10;
        } else {
            protection.vulnerabilities.push(`現金バッファ${cashBuffer}円（得意先倒産で危機）`);
            protection.recommendations.push({ type: 'build_cash', priority: 'high', reason: '得意先倒産対策' });
        }

        // チップ複数持ちチェック（返却対策）
        if ((company.chips.research || 0) >= 2) protection.score += 5;
        if ((company.chips.education || 0) >= 2) protection.score += 5;
        if ((company.chips.advertising || 0) >= 2) protection.score += 5;

        // 人員予備チェック
        if (company.workers >= 2) protection.score += 5;
        if (company.salesmen >= 2) protection.score += 5;

        // チャンス活用準備チェック
        const hasProducts = company.products > 0;
        const hasResearch = (company.chips.research || 0) > 0;
        const hasEducation = (company.chips.education || 0) > 0;
        const hasAdvertising = (company.chips.advertising || 0) > 0;

        if (hasProducts && hasResearch) {
            protection.score += 5;  // 研究開発成功に対応可能（6枚もある！）
        }
        if (hasProducts && hasEducation) {
            protection.score += 3;  // 教育成功に対応可能
        }
        if (hasProducts && hasAdvertising) {
            protection.score += 3;  // 広告成功に対応可能
        }

        return protection;
    },

    // === リスクを考慮した最適行動を推奨 ===
    getRecommendedAction: function(company, companyIndex) {
        const riskAnalysis = this.analyzeRiskProtection(company);
        const cashFlow = this.forecastCashFlow(company);
        const period = gameState.currentPeriod;

        // 高優先度の脆弱性があれば対策を推奨
        const highPriorityRecs = riskAnalysis.recommendations.filter(r => r.priority === 'high');

        if (highPriorityRecs.length > 0) {
            const rec = highPriorityRecs[0];

            // 在庫過多は販売で解決
            if (rec.type === 'reduce_inventory' && company.products > 0) {
                return { action: 'SELL_TO_REDUCE_RISK', reason: '在庫過多リスク回避', priority: 'high' };
            }

            // 現金不足は販売で解決
            if (rec.type === 'build_cash' && company.products > 0) {
                return { action: 'SELL_FOR_CASH', reason: '現金バッファ確保', priority: 'high' };
            }
        }

        // チャンスカード準備（研究開発成功が6枚と多い！）
        const researchChips = company.chips.research || 0;
        if (researchChips === 0 && company.products > 0 && cashFlow.canInvest) {
            return {
                action: 'BUY_RESEARCH_FOR_OPPORTUNITY',
                reason: '研究開発成功カード（6枚）に備える',
                priority: 'medium'
            };
        }

        // 保険未加入で在庫が多い
        if (!company.chips.insurance &&
            (company.materials > 3 || company.products > 3) &&
            company.cash > cashFlow.mustPay + 20) {
            return {
                action: 'BUY_INSURANCE',
                reason: '火災・盗難対策',
                priority: 'medium'
            };
        }

        return null;  // 特別な推奨なし
    },

    // === リスクカード確率計算 ===
    calculateRiskProbability: function() {
        // デッキ構成: 60枚意思決定 + 15枚リスク = 75枚
        // リスクカード確率: 15/75 = 20% = 1/5
        // リスクカードプール: 64枚（そこからランダムに選ばれる）
        return {
            riskProbability: 0.20,
            decisionProbability: 0.80,
            expectedRiskCardsPerPeriod: 3,  // 15行 × 0.20 = 3枚
            // 各カテゴリの確率（リスクカード64枚中）
            // ※1回のリスクで各カードを引く確率
            categoryProbability: {
                // 損失系
                materialLoss: 2/64,       // 倉庫火災 (材料全損)
                productLoss: 2/64,        // 盗難発見 (製品2個)
                wipLoss: 2/64,            // 製造ミス発生 (仕掛1個)
                excessInventory: 2/64,    // 不良在庫発生 (20超過分)
                returnProduct: 3/64,      // 返品発生 (製品1個+売上-20)

                // チップ返却系
                researchFail: 3/64,       // 研究開発失敗
                advertisingFail: 2/64,    // 広告政策失敗
                educationFail: 2/64,      // 教育失敗

                // 現金損失系
                customerBankrupt: 2/64,   // 得意先倒産 (-30円、2期免除)
                claim: 2/64,              // クレーム発生 (-5円)
                relative: 2/64,           // 縁故採用 (-5円)
                computerTrouble: 2/64,    // コンピュータートラブル (-10円)
                designTrouble: 2/64,      // 設計トラブル (-10円)
                machineFail: 2/64,        // 機械故障 (-5円)

                // 行動制限系
                consumerMovement: 2/64,   // 消費者運動 (販売不可)
                accident: 2/64,           // 労災発生 (生産不可)

                // 休み系
                strike: 2/64,             // ストライキ (1回休み)
                longDispute: 2/64,        // 長期労務紛争 (2回休み)
                sickBoss: 2/64,           // 社長病気 (1回休み)

                // 人員系
                workerRetire: 2/64,       // ワーカー退職
                salesmanRetire: 2/64,     // セールスマン退職

                // その他
                economicChange: 2/64,     // 景気変動 (逆回り)

                // チャンスカード（合計18枚）
                researchSuccess: 6/64,    // 研究開発成功 ★6枚（最多！）
                educationSuccess: 2/64,   // 教育成功
                advertisingSuccess: 3/64, // 広告成功
                exclusiveSale: 3/64,      // 商品の独占販売
                specialService: 2/64,     // 特別サービス
                commonPurchase: 2/64      // 各社共通
            },
            // チャンスカード合計: 6+2+3+3+2+2 = 18枚 = 28.1%
            opportunityTotal: 18/64
        };
    },

    // ============================================
    // 📊 G（利益）シミュレーション - Gマイナス回避の核心
    // ============================================
    // 製品原価: 材料13円 + 加工2円 = 15円
    // 最低販売価格: 15円以上でないと赤字

    simulateExpectedG: function(company, companyIndex) {
        const period = gameState.currentPeriod;
        const rowsRemaining = gameState.maxRows - (company.currentRow || 1);

        // 現在のPQ（売上）
        const currentPQ = company.totalSales || 0;

        // 今後の見込み販売
        const salesCapacity = getSalesCapacity(company);
        const mfgCapacity = getManufacturingCapacity(company);
        const potentialProducts = company.products + Math.min(company.materials + company.wip, mfgCapacity);
        const estimatedSalesCycles = Math.floor(rowsRemaining / 4);
        const estimatedSalesQty = Math.min(potentialProducts, salesCapacity * estimatedSalesCycles);

        // 平均販売価格（相場から推定）
        const avgPrice = this.marketPriceHistory.length > 0
            ? this.marketPriceHistory.reduce((a,b) => a+b, 0) / this.marketPriceHistory.length
            : 28;

        const estimatedPQ = currentPQ + (estimatedSalesQty * avgPrice);

        // VQ計算
        const materialCost = company.totalMaterialCost || 0;
        const productionCost = company.totalProductionCost || 0;
        const startValue = (company.periodStartInventory?.materials || 0) * 13 +
                          (company.periodStartInventory?.wip || 0) * 14 +
                          (company.periodStartInventory?.products || 0) * 15;
        // 期末在庫予測（販売後）
        const endProducts = Math.max(0, potentialProducts - estimatedSalesQty);
        const endValue = endProducts * 15; // 製品のみ残る想定
        const estimatedVQ = materialCost + productionCost + startValue - endValue;

        // MQ
        const estimatedMQ = estimatedPQ - estimatedVQ;

        // F（固定費）- 現在の状態で計算
        const estimatedF = calculateFixedCost(company);

        // G = MQ - F
        const estimatedG = estimatedMQ - estimatedF;

        return {
            estimatedPQ,
            estimatedVQ,
            estimatedMQ,
            estimatedF,
            estimatedG,
            isGPositive: estimatedG > 0,
            gBuffer: estimatedG,  // 余裕があればプラス
            minPriceForBreakeven: estimatedG < 0 ? Math.ceil((estimatedF - estimatedMQ + estimatedG) / Math.max(1, estimatedSalesQty)) + avgPrice : 15,
            message: estimatedG > 0 ? `G=${estimatedG}円の黒字見込み` : `G=${estimatedG}円の赤字リスク！`
        };
    },

    // ============================================
    // 📈 市場相場学習システム
    // ============================================
    marketPriceHistory: [],  // 成立価格の履歴

    recordBidResult: function(price, won, marketName) {
        if (won && price > 0) {
            this.marketPriceHistory.push(price);
            // 直近20件のみ保持
            if (this.marketPriceHistory.length > 20) {
                this.marketPriceHistory.shift();
            }
        }
    },

    getMarketPriceStats: function() {
        if (this.marketPriceHistory.length === 0) {
            return { avg: 28, min: 26, max: 32, count: 0 };
        }
        const prices = this.marketPriceHistory;
        return {
            avg: Math.round(prices.reduce((a,b) => a+b, 0) / prices.length),
            min: Math.min(...prices),
            max: Math.max(...prices),
            count: prices.length
        };
    },

    // ============================================
    // 🎯 競合を見た賢い入札価格決定
    // ============================================
    calculateSmartBidPrice: function(company, market, companyIndex) {
        const competitors = this.analyzeCompetitors(company, companyIndex);
        const gSimulation = this.simulateExpectedG(company, companyIndex);
        const priceStats = this.getMarketPriceStats();
        const period = gameState.currentPeriod;

        // 製品原価 = 15円（材料13円 + 加工2円）
        const PRODUCT_COST = 15;
        const basePrice = market.sellPrice;
        const myResearchChips = company.chips.research || 0;
        const myCompetitiveness = myResearchChips * 2;

        // === 1. 利益確保の最低価格（絶対に原価割れしない） ===
        // MQ = P - V = P - 15 なので、MQが正になるには P > 15
        // さらにFを賄うためには MQ × Q > F が必要
        const periodEndCost = calculatePeriodPayment(company);
        const minProfitablePrice = Math.max(16, PRODUCT_COST + 1);  // 最低16円

        // === 2. Gがマイナスになりそうなら価格を調整 ===
        let targetPrice;
        if (!gSimulation.isGPositive) {
            // 赤字リスク → 高めに売って挽回を狙う
            targetPrice = Math.max(priceStats.avg + 2, 28);
            console.log(`[AI入札] ${company.name}: 赤字リスク(G=${gSimulation.estimatedG}) → 高め価格${targetPrice}円`);
        } else {
            // 黒字見込み → 相場に合わせつつ競争力を活用
            targetPrice = priceStats.avg || 28;
        }

        // === 3. 競合の研究チップを見て価格調整 ===
        // 他社より研究チップが多ければ、同じ記帳価格でもコール価格で勝てる
        const maxRivalResearch = Math.max(...competitors.rivals.map(r => r.researchChips), 0);
        const researchAdvantage = myResearchChips - maxRivalResearch;

        if (researchAdvantage > 0) {
            // 研究チップで有利 → 価格を少し上げても勝てる
            targetPrice += researchAdvantage * 1;  // 1枚あたり+1円
            console.log(`[AI入札] ${company.name}: 研究チップ有利(+${researchAdvantage}) → 価格+${researchAdvantage}円`);
        } else if (researchAdvantage < 0) {
            // 研究チップで不利 → 価格を下げて勝負
            targetPrice += researchAdvantage * 1;  // 1枚あたり-1円
            console.log(`[AI入札] ${company.name}: 研究チップ不利(${researchAdvantage}) → 価格${researchAdvantage}円`);
        }

        // === 4. 過去の相場を参考に ===
        if (priceStats.count >= 3) {
            // 相場データがあれば参考にする
            const marketAvg = priceStats.avg;
            // 相場より極端に高い/低いなら調整
            if (targetPrice > marketAvg + 5) {
                targetPrice = marketAvg + 3;  // 高すぎ → 少し下げる
            } else if (targetPrice < marketAvg - 5) {
                targetPrice = marketAvg - 2;  // 安すぎ → 少し上げる
            }
        }

        // === 5. 最終調整（原価割れ防止、上限超過防止） ===
        targetPrice = Math.max(minProfitablePrice, Math.min(targetPrice, basePrice));

        // 戦略による微調整
        switch (company.strategy) {
            case 'aggressive':
                targetPrice -= 1;  // 攻撃的：少し安く
                break;
            case 'conservative':
                targetPrice += 1;  // 保守的：少し高く
                break;
            case 'price_focused':
                targetPrice -= 2;  // 価格重視：さらに安く
                break;
        }

        // === 6. 🔥 感情による調整（悔しさ・復讐心・勝利渇望） ===
        const emotionalAdj = this.getEmotionalBidAdjustment(companyIndex, targetPrice);
        targetPrice += emotionalAdj;

        // 最終チェック
        return Math.max(minProfitablePrice, Math.min(Math.round(targetPrice), basePrice));
    },

    // ============================================
    // 📋 期首計画システム（利益最大化計画）
    // ============================================

    periodPlans: {},  // 会社インデックスをキーとした期首計画

    // 期首に計画を策定
    createPeriodPlan: function(company, companyIndex) {
        const period = gameState.currentPeriod;
        const rowsInPeriod = gameState.maxRows;
        const periodsRemaining = 5 - period;

        // 現状分析
        const mfgCapacity = getManufacturingCapacity(company);
        const salesCapacity = getSalesCapacity(company);
        const periodEndCost = calculatePeriodPayment(company);
        const competitors = this.analyzeCompetitors(company, companyIndex);
        const cashFlow = this.forecastCashFlow(company);

        // === 1. 目標設定 ===
        const equityGap = competitors.leader.equity - company.equity;
        const targetGPerPeriod = equityGap > 0
            ? Math.ceil((equityGap + 50) / periodsRemaining)  // 追いつき＋余裕
            : 30;  // リードしているなら安定経営

        // === 2. 販売計画 ===
        // G = MQ - F で、MQ = (P - V) × Q
        // F（固定費）は期末に確定、MQを最大化する
        const estimatedF = calculateFixedCost(company);
        const targetMQ = targetGPerPeriod + estimatedF;  // 目標G + F
        const avgMQPerUnit = 13;  // 平均MQ/個（28円売価 - 15円原価）
        const targetSalesQty = Math.ceil(targetMQ / avgMQPerUnit);

        // 販売回数計算（4行で1サイクル：材料→生産→生産→販売）
        const salesCycles = Math.floor((rowsInPeriod - 2) / 4);  // 期首2行使用
        const salesPerCycle = Math.min(salesCapacity, targetSalesQty);

        // === 3. 製造計画 ===
        const totalProductionNeeded = targetSalesQty + 3;  // 在庫バッファ
        const productionPerCycle = Math.min(mfgCapacity, Math.ceil(totalProductionNeeded / salesCycles));

        // === 4. 仕入れ計画 ===
        const materialNeed = totalProductionNeeded - company.materials - company.wip;
        const purchasePerCycle = Math.ceil(materialNeed / salesCycles);

        // === 5. 投資計画 ===
        const investmentBudget = Math.max(0, company.cash - periodEndCost - 50);  // 安全余裕50円
        const investments = [];

        // 2期の投資優先順位【v8シミュレーション結果】
        // 最強戦略: R2E1_NR_SM_DYN = 研究2 + 教育1 + 翌期研究1
        if (period === 2) {
            // 研究チップ2枚（優先度1）- 名古屋¥28市場確保
            if (company.chips.research < 2 && investmentBudget >= 40) {
                const researchQty = Math.min(2 - company.chips.research, Math.floor(investmentBudget / 20));
                investments.push({ type: 'research', qty: researchQty, cost: researchQty * 20, priority: 1 });
            }
            // 教育チップ1枚（優先度2）- 製造+1、販売+1
            // 【v8修正】2枚は不要（効果はワーカー数で上限）
            if (company.chips.education < 1 && investmentBudget >= 20) {
                investments.push({ type: 'education', qty: 1, cost: 20, priority: 2 });
            }
            // 翌期チップ（優先度3）- 成功率+12%の効果
            if (investmentBudget >= 20) {
                investments.push({ type: 'nextPeriodChip_research', qty: 1, cost: 20, priority: 3 });
            }
        } else {
            // 3期以降の投資優先順位
            // 次期用チップ（20円で40円相当）
            const nextChipsTotal = (company.nextPeriodChips?.research || 0) +
                                   (company.nextPeriodChips?.education || 0);
            if (nextChipsTotal < 3 && periodsRemaining >= 2 && investmentBudget >= 20) {
                investments.push({ type: 'nextPeriodChip', qty: 3 - nextChipsTotal, cost: (3 - nextChipsTotal) * 20, priority: 1 });
            }
            // 特急チップ（ROI計算して）
            const expressROI = this.shouldUseExpressChip(company, 'research', companyIndex);
            if (expressROI.shouldUse && investmentBudget >= 40) {
                investments.push({ type: 'expressResearch', qty: 1, cost: 40, priority: 2 });
            }
        }

        // === 6. 資金計画 ===
        const expectedIncome = targetSalesQty * 28;  // 予想売上
        const expectedExpense = materialNeed * 12 + totalProductionNeeded * 2;  // 材料＋加工費
        const investmentCost = investments.reduce((sum, inv) => sum + inv.cost, 0);
        const netCashFlow = expectedIncome - expectedExpense - investmentCost - periodEndCost;
        const needsBorrowing = period >= 3 && netCashFlow < 0 && cashFlow.availableForInvestment < 0;

        // === 7. 競合対策 ===
        const competitorStrategy = {
            targetResearchAdvantage: Math.max(0, competitors.averageResearch - (company.chips.research || 0) + 1),
            shouldBlockLeader: competitors.leader.equity > company.equity + 100,
            weakCompetitors: competitors.strugglers.map(s => s.name)
        };

        // 計画をまとめる
        const plan = {
            period,
            created: Date.now(),

            // 目標
            targets: {
                G: targetGPerPeriod,
                MQ: targetMQ,
                salesQty: targetSalesQty,
                equityGap
            },

            // 販売計画
            salesPlan: {
                targetQty: targetSalesQty,
                cycleQty: salesPerCycle,
                totalCycles: salesCycles,
                targetPrice: 28 + (company.chips.research || 0) * 2  // 研究チップ効果
            },

            // 製造計画
            productionPlan: {
                targetQty: totalProductionNeeded,
                cycleQty: productionPerCycle
            },

            // 仕入れ計画
            purchasePlan: {
                totalNeed: materialNeed,
                cycleQty: purchasePerCycle,
                maxPrice: 13  // 基本材料費
            },

            // 投資計画
            investmentPlan: {
                budget: investmentBudget,
                items: investments,
                totalCost: investmentCost
            },

            // 資金計画
            cashPlan: {
                expectedIncome,
                expectedExpense,
                netCashFlow,
                needsBorrowing,
                safetyBuffer: 50
            },

            // 競合対策
            competitorStrategy,

            // 優先アクション（期首）
            priorityActions: this.determinePriorityActions(company, investments, cashFlow)
        };

        // 計画を保存
        this.periodPlans[companyIndex] = plan;

        console.log(`[AI計画] ${company.name} の第${period}期計画:`, {
            目標G: plan.targets.G,
            販売目標: plan.salesPlan.targetQty,
            投資計画: plan.investmentPlan.items.map(i => i.type)
        });

        return plan;
    },

    // 優先アクションを決定
    determinePriorityActions: function(company, investments, cashFlow) {
        const actions = [];
        const period = gameState.currentPeriod;

        // 1. 支払い余力の確保が最優先
        if (cashFlow.isDangerous) {
            actions.push({ action: 'SECURE_CASH', reason: '期末支払い危機', priority: 'critical' });
        }

        // 2. 投資実行
        investments.sort((a, b) => a.priority - b.priority);
        investments.forEach(inv => {
            actions.push({ action: `INVEST_${inv.type.toUpperCase()}`, reason: inv.type, priority: 'high' });
        });

        // 3. 在庫確保
        if (company.materials < 3) {
            actions.push({ action: 'BUY_MATERIALS', reason: '材料不足', priority: 'medium' });
        }

        // 4. 生産開始
        if (company.materials > 0 || company.wip > 0) {
            actions.push({ action: 'PRODUCE', reason: '在庫を製品化', priority: 'medium' });
        }

        return actions;
    },

    // 計画を取得
    getPeriodPlan: function(companyIndex) {
        return this.periodPlans[companyIndex] || null;
    },

    // 計画の進捗をチェック
    checkPlanProgress: function(company, companyIndex) {
        const plan = this.periodPlans[companyIndex];
        if (!plan) return null;

        const salesProgress = (company.totalSales || 0) / (plan.salesPlan.targetQty * 28);
        const productionProgress = company.products / plan.productionPlan.targetQty;

        return {
            salesProgress: Math.min(1, salesProgress),
            productionProgress: Math.min(1, productionProgress),
            isOnTrack: salesProgress >= 0.5 || productionProgress >= 0.7,
            needsAdjustment: salesProgress < 0.3 && productionProgress < 0.5
        };
    },

    // ============================================
    // 💰 支払い能力チェック（行動前に必ず確認）
    // ============================================

    canAffordAction: function(company, actionCost) {
        const periodEndCost = calculatePeriodPayment(company);
        const safetyBuffer = 30;  // 最低安全余裕
        const minRequiredCash = periodEndCost + safetyBuffer;

        return company.cash - actionCost >= minRequiredCash;
    },

    // 安全な投資額を計算
    getSafeInvestmentAmount: function(company) {
        const periodEndCost = calculatePeriodPayment(company);
        const safetyBuffer = AIBrain.getOptimalSafetyBuffer(company.strategy || 'balanced');
        return Math.max(0, company.cash - periodEndCost - safetyBuffer);
    },

    // 期末に払えるか確認
    canPayPeriodEnd: function(company) {
        const periodEndCost = calculatePeriodPayment(company);
        return company.cash >= periodEndCost;
    },

    // ============================================
    // 🎯 G最大化アルゴリズム強化版
    // G = MQ - F を最大化するための高度な意思決定
    // ============================================

    /**
     * 期待Gを計算（現在の状態から期末までの予測利益）
     */
    calculateExpectedG: function(company, companyIndex) {
        const period = gameState.currentPeriod;
        const rowsRemaining = gameState.maxRows - (company.currentRow || 1);
        const mfgCapacity = getManufacturingCapacity(company);
        const salesCapacity = getSalesCapacity(company);

        // === PQ（売上高）予測 ===
        // 販売サイクル数 = 残り行数 ÷ 4（材料→投入→完成→販売）
        const salesCycles = Math.floor(rowsRemaining / 4);
        const avgQuantityPerSale = Math.min(salesCapacity, mfgCapacity, 4);
        const avgPrice = this.getExpectedSalesPrice(company);
        const expectedPQ = salesCycles * avgQuantityPerSale * avgPrice;

        // === VQ（変動費）予測 ===
        const totalUnits = salesCycles * avgQuantityPerSale;
        const avgMaterialCost = 12; // 材料平均価格
        const productionCostPerUnit = 2; // 投入+完成の製造費
        const expectedVQ = totalUnits * (avgMaterialCost + productionCostPerUnit);

        // === MQ（限界利益）予測 ===
        const expectedMQ = expectedPQ - expectedVQ;

        // === F（固定費）予測 ===
        const expectedF = this.calculateExpectedF(company, period);

        // === G（経常利益）予測 ===
        const expectedG = expectedMQ - expectedF;

        return {
            expectedPQ,
            expectedVQ,
            expectedMQ,
            expectedF,
            expectedG,
            salesCycles,
            avgPrice,
            mqPerCycle: avgQuantityPerSale * (avgPrice - avgMaterialCost - productionCostPerUnit),
            isPositive: expectedG > 0
        };
    },

    /**
     * 予測販売価格を計算（研究チップと市場状況を考慮）
     */
    getExpectedSalesPrice: function(company) {
        const researchBonus = (company.chips.research || 0) * 2;
        const basePrice = 28; // 平均市場価格
        const competitivenessBonus = Math.min(researchBonus, 6); // 最大+6
        return basePrice + Math.floor(competitivenessBonus * 0.3);
    },

    /**
     * 予測固定費を計算
     */
    calculateExpectedF: function(company, period) {
        let f = 0;

        // 給料（機械・ワーカー・セールスマン）
        const unitCost = BASE_SALARY_BY_PERIOD[period] || 22;
        f += company.machines.length * unitCost;
        f += company.workers * unitCost;
        f += company.salesmen * unitCost;

        // 減価償却
        company.machines.forEach(m => {
            if (m.type === 'small') {
                f += m.attachments > 0 ? 15 : 10;
            } else {
                f += 20;
            }
        });

        // チップ維持費
        f += (company.chips.computer || 0) * 5;
        f += (company.chips.insurance || 0) * 5;
        f += (company.chips.research || 0) * 20;
        f += (company.chips.education || 0) * 20;
        f += (company.chips.advertising || 0) * 20;

        // 金利
        f += Math.floor((company.loans || 0) * 0.04);
        f += Math.floor((company.shortLoans || 0) * 0.08);

        return f;
    },

    /**
     * 投資判断：GへのROI（投資収益率）を計算
     */
    calculateGImpactROI: function(company, investmentType, companyIndex) {
        const currentG = this.calculateExpectedG(company, companyIndex);
        const period = gameState.currentPeriod;
        const periodsRemaining = 5 - period;
        const rowsRemaining = gameState.maxRows - (company.currentRow || 1);

        let cost = 0;
        let immediateGBoost = 0;
        let longTermValue = 0;

        switch (investmentType) {
            case 'research':
                cost = period === 2 ? 20 : 40;
                // 価格競争力+2 → 販売価格が実質+1〜2円改善
                immediateGBoost = Math.floor(rowsRemaining / 4) * 2 * 2;
                longTermValue = periodsRemaining * 15; // 次期以降の価値
                break;

            case 'education':
                cost = period === 2 ? 20 : 40;
                // 製造+1、販売+1 → 1サイクルあたりMQ約+13
                immediateGBoost = Math.floor(rowsRemaining / 4) * 13;
                longTermValue = periodsRemaining * 25;
                break;

            case 'advertising':
                cost = period === 2 ? 20 : 40;
                // 販売能力+2 → ボトルネック解消効果
                const salesBoost = Math.min(2, getManufacturingCapacity(company) - getSalesCapacity(company));
                immediateGBoost = Math.floor(rowsRemaining / 4) * salesBoost * 13;
                longTermValue = periodsRemaining * 15;
                break;

            case 'worker':
                cost = 5 + (BASE_SALARY_BY_PERIOD[period] || 22) * 1.5;
                // 製造能力+1（機械があれば）
                immediateGBoost = company.machines.length > company.workers ?
                    Math.floor(rowsRemaining / 4) * 13 : 0;
                longTermValue = periodsRemaining * 20;
                break;

            case 'salesman':
                cost = 5 + (BASE_SALARY_BY_PERIOD[period] || 22) * 1.5;
                // 販売能力+2
                immediateGBoost = Math.floor(rowsRemaining / 4) * 2 * 13;
                longTermValue = periodsRemaining * 25;
                break;
        }

        const totalValue = immediateGBoost + longTermValue;
        const roi = cost > 0 ? ((totalValue - cost) / cost * 100) : 0;

        return {
            type: investmentType,
            cost,
            immediateGBoost,
            longTermValue,
            totalValue,
            roi: Math.round(roi),
            isWorthIt: roi > 20, // 20%以上のROIなら投資価値あり
            netGImpact: totalValue - cost
        };
    },

    /**
     * 🛡️ 投資が短期借入を引き起こすかチェック
     * @returns {boolean} 安全に投資できるならtrue
     */
    canAffordWithoutShortLoan: function(company, investmentCost) {
        const period = gameState.currentPeriod;
        const periodEndCost = calculatePeriodPayment(company);
        const riskCardBuffer = company.chips.insurance ? 15 : 40;
        const safetyBuffer = 80; // 十分な安全マージン
        const totalRequired = periodEndCost + riskCardBuffer + safetyBuffer;

        // 投資後に期末コストを賄えるか
        const cashAfterInvestment = company.cash - investmentCost;
        const isSafe = cashAfterInvestment >= totalRequired;

        if (!isSafe) {
            console.log(`[AI短期借入回避] ${company.name}: 投資¥${investmentCost}は危険（残り¥${cashAfterInvestment} < 必要¥${totalRequired}）`);
        }

        return isSafe;
    },

    /**
     * 最適な投資戦略を決定（G最大化の観点）
     * 🛡️ 短期借入回避を考慮
     */
    getOptimalInvestmentStrategy: function(company, companyIndex) {
        const investments = ['research', 'education', 'advertising', 'worker', 'salesman'];
        const results = investments.map(type =>
            this.calculateGImpactROI(company, type, companyIndex)
        );

        // ROIでソート
        results.sort((a, b) => b.roi - a.roi);

        // 🛡️ 強化: 短期借入を引き起こさない投資のみ
        const affordable = results.filter(r =>
            this.canAffordWithoutShortLoan(company, r.cost)
        );
        const worthwhile = affordable.filter(r => r.isWorthIt);

        return {
            allOptions: results,
            best: worthwhile[0] || null,
            affordable,
            recommendation: worthwhile.length > 0 ?
                `${worthwhile[0].type}投資推奨（ROI:${worthwhile[0].roi}%）` :
                '投資より販売サイクル優先（短期借入回避）'
        };
    },

    /**
     * 5期クリア条件チェック
     */
    checkPeriod5ClearConditions: function(company) {
        const totalInventory = company.materials + company.wip + company.products;
        const nextChips = (company.nextPeriodChips?.research || 0) +
                          (company.nextPeriodChips?.education || 0) +
                          (company.nextPeriodChips?.advertising || 0);

        return {
            inventoryTarget: 10,
            currentInventory: totalInventory,
            inventoryMet: totalInventory >= 10,
            chipTarget: 3,
            currentChips: nextChips,
            chipsMet: nextChips >= 3,
            allMet: totalInventory >= 10 && nextChips >= 3,
            priority: nextChips < 3 ? 'chips' : (totalInventory < 10 ? 'inventory' : 'done')
        };
    },

    /**
     * MQ最大化のための販売タイミング判断
     */
    shouldSellNow: function(company, market, companyIndex) {
        const period = gameState.currentPeriod;
        const rowsRemaining = gameState.maxRows - (company.currentRow || 1);
        const competitors = this.analyzeCompetitors(company, companyIndex);

        // 5期は在庫調整が優先
        if (period === 5) {
            const clearCheck = this.checkPeriod5ClearConditions(company);
            if (!clearCheck.inventoryMet) {
                return {
                    shouldSell: false,
                    reason: '在庫10個未達のため販売控え'
                };
            }
            if (company.materials + company.wip + company.products > 10) {
                return {
                    shouldSell: true,
                    reason: '余剰在庫の売却',
                    maxQuantity: company.products - (10 - company.materials - company.wip)
                };
            }
        }

        // 市場の空き具合をチェック
        if (!market) {
            // marketが渡されない場合は全市場の空きを計算
            const markets = gameState.markets || [];
            const totalSpace = markets.reduce((sum, m) => {
                if (!m || m.closed) return sum;
                return sum + ((m.maxStock || 0) - (m.currentStock || 0));
            }, 0);
            if (totalSpace <= 0) {
                return { shouldSell: false, reason: '市場枠なし' };
            }
        } else {
            const marketCapacity = (market.maxStock || 0) - (market.currentStock || 0);
            if (marketCapacity <= 0) {
                return { shouldSell: false, reason: '市場枠なし' };
            }
        }

        // 期末が近い場合は積極的に売る
        if (rowsRemaining <= 5 && company.products > 0) {
            return { shouldSell: true, reason: '期末接近による在庫処分', aggressive: true };
        }

        // 現金が足りない場合は売る
        const periodEndCost = calculatePeriodPayment(company);
        if (company.cash < periodEndCost + 30) {
            return { shouldSell: true, reason: '期末支払いのための緊急販売', aggressive: true };
        }

        // 競合が販売できない状態なら高値で売れる
        const rivalsCanSell = competitors.rivals.filter(r => r.canSellNow).length;
        if (rivalsCanSell === 0 && company.products > 0) {
            return {
                shouldSell: true,
                reason: '競合不在のチャンス販売',
                premiumPricing: true
            };
        }

        return { shouldSell: true, reason: '通常の販売判断' };
    },

    // ========================================
    // === 強化AI機能: 他社行動予測 ===
    // ========================================

    /**
     * 競合の入札価格を予測
     * @returns {Array} 各競合の予測入札価格
     */
    predictCompetitorBidPrices: function(company, companyIndex) {
        const predictions = [];

        gameState.companies.forEach((rival, i) => {
            if (i === companyIndex) return;

            // 入札参加するかどうか
            const needsMaterials = rival.materials < 5;
            const hasCash = rival.cash > 30;
            const hasCapacity = rival.materials < 20;
            const willBid = needsMaterials && hasCash && hasCapacity;

            if (!willBid) {
                predictions.push({ index: i, willBid: false, price: 0 });
                return;
            }

            // 予測価格の計算
            let basePrice = 26; // 最低入札価格

            // 研究チップによる価格競争力（チップが多い=安く仕入れたい）
            const researchBonus = (rival.chips.research || 0) * 2;

            // 現金に余裕があれば高めに入札（確実に欲しい）
            const cashFactor = rival.cash > 100 ? 3 : rival.cash > 60 ? 1 : 0;

            // 在庫が少ないほど高めに入札（緊急度）
            const urgencyFactor = rival.materials === 0 ? 4 :
                                  rival.materials < 3 ? 2 : 0;

            // 戦略別の傾向
            const strategyFactor = {
                'aggressive': 3,
                'price_focused': -2, // 安く買いたい
                'conservative': -1,
                'balanced': 0,
                'tech_focused': 1,
                'unpredictable': Math.floor(Math.random() * 6) - 2
            }[rival.strategy] || 0;

            const predictedPrice = Math.max(26, Math.min(35,
                basePrice + cashFactor + urgencyFactor + strategyFactor - Math.floor(researchBonus / 2)
            ));

            predictions.push({
                index: i,
                name: rival.name,
                willBid: true,
                price: predictedPrice,
                confidence: 0.7, // 70%信頼度
                reasoning: {
                    basePrice,
                    researchBonus,
                    cashFactor,
                    urgencyFactor,
                    strategyFactor
                }
            });
        });

        return predictions;
    },

    /**
     * 最適な入札価格を計算
     * 勝てる最低価格を予測し、かつROIを最大化
     */
    calculateOptimalBidPrice: function(company, companyIndex, currentBasePrice) {
        const predictions = this.predictCompetitorBidPrices(company, companyIndex);
        const biddingRivals = predictions.filter(p => p.willBid);

        if (biddingRivals.length === 0) {
            // 競合なし：最低価格で入札
            return {
                optimalPrice: 26,
                reason: '競合入札なし予測',
                confidence: 0.9
            };
        }

        // 競合の最高予測価格を取得
        const maxRivalPrice = Math.max(...biddingRivals.map(p => p.price));

        // 自社の研究チップによる優位性
        const myResearch = company.chips.research || 0;
        const priceAdvantage = myResearch * 2;

        // 勝つための最低価格（同額なら研究チップで勝てる可能性）
        let winPrice = maxRivalPrice;

        // 研究チップで優位なら同額で勝てる可能性あり
        const rivalMaxResearch = Math.max(...biddingRivals.map(p => {
            const rival = gameState.companies[p.index];
            return rival.chips.research || 0;
        }));

        if (myResearch > rivalMaxResearch) {
            // 研究チップで優位なので同額以下でも勝てる可能性
            winPrice = Math.max(26, maxRivalPrice - 1);
        } else if (myResearch < rivalMaxResearch) {
            // 研究チップで不利なので高めに入札が必要
            winPrice = maxRivalPrice + 1;
        }

        // 親ボーナス考慮
        const isDealer = gameState.currentDealer === companyIndex;
        if (isDealer) {
            winPrice = Math.max(26, winPrice - 2);
        }

        return {
            optimalPrice: Math.min(35, Math.max(26, winPrice)),
            maxRivalPrice,
            rivalMaxResearch,
            myResearch,
            isDealer,
            reason: `競合最高${maxRivalPrice}円予測、研究${myResearch > rivalMaxResearch ? '優位' : myResearch < rivalMaxResearch ? '劣位' : '同等'}`,
            confidence: 0.65
        };
    },

    /**
     * 競合の次のアクションを予測
     */
    predictCompetitorActions: function(company, companyIndex) {
        const predictions = [];

        gameState.companies.forEach((rival, i) => {
            if (i === companyIndex) return;

            const actions = [];

            // 製品があり販売能力があれば売る可能性高い
            if (rival.products > 0 && getSalesCapacity(rival) > 0) {
                actions.push({ action: 'SELL', probability: 0.8 });
            }

            // 仕掛品があれば完成させる可能性
            if (rival.wip > 0 && getManufacturingCapacity(rival) > rival.wip) {
                actions.push({ action: 'COMPLETE', probability: 0.7 });
            }

            // 材料があれば投入する可能性
            if (rival.materials > 0 && getManufacturingCapacity(rival) > 0) {
                actions.push({ action: 'PRODUCE', probability: 0.6 });
            }

            // 現金があればチップ購入の可能性
            if (rival.cash > 50) {
                actions.push({ action: 'BUY_CHIP', probability: 0.4 });
            }

            predictions.push({
                index: i,
                name: rival.name,
                predictedActions: actions.sort((a, b) => b.probability - a.probability),
                mostLikely: actions[0]?.action || 'WAIT'
            });
        });

        return predictions;
    },

    // ========================================
    // === 強化AI機能: 複数ターン先読み ===
    // ========================================

    /**
     * N行先までのシミュレーション
     * @param {number} lookAhead 先読み行数（デフォルト3）
     */
    simulateFutureTurns: function(company, companyIndex, lookAhead = 3) {
        // 現在の状態をコピー
        const simState = {
            cash: company.cash,
            materials: company.materials,
            wip: company.wip,
            products: company.products,
            equity: company.equity,
            row: company.currentRow || 1
        };

        const maxRows = gameState.maxRows;
        const scenarios = [];

        // シナリオ1: 積極販売
        const aggressiveSim = this.simulateScenario(simState, 'aggressive', lookAhead, company);
        scenarios.push({ name: 'aggressive', ...aggressiveSim });

        // シナリオ2: 保守的（在庫維持）
        const conservativeSim = this.simulateScenario(simState, 'conservative', lookAhead, company);
        scenarios.push({ name: 'conservative', ...conservativeSim });

        // シナリオ3: 投資重視
        const investmentSim = this.simulateScenario(simState, 'investment', lookAhead, company);
        scenarios.push({ name: 'investment', ...investmentSim });

        // 最適シナリオを選択（期待G最大）
        const best = scenarios.reduce((max, s) =>
            s.expectedG > max.expectedG ? s : max, scenarios[0]);

        return {
            scenarios,
            recommended: best.name,
            expectedG: best.expectedG,
            reasoning: `${best.name}シナリオが期待G${best.expectedG}で最適`
        };
    },

    /**
     * 特定シナリオのシミュレーション
     */
    simulateScenario: function(state, scenarioType, turns, company) {
        let cash = state.cash;
        let materials = state.materials;
        let wip = state.wip;
        let products = state.products;
        let totalRevenue = 0;
        let totalCost = 0;

        const salesPrice = 40 + (company.chips.research || 0) * 2;

        for (let t = 0; t < turns; t++) {
            switch (scenarioType) {
                case 'aggressive':
                    // 売れるだけ売る
                    if (products > 0) {
                        const sellQty = Math.min(products, getSalesCapacity(company));
                        totalRevenue += sellQty * salesPrice;
                        products -= sellQty;
                    }
                    // 完成
                    if (wip > 0) {
                        const completeQty = Math.min(wip, getManufacturingCapacity(company));
                        products += completeQty;
                        wip -= completeQty;
                    }
                    // 投入
                    if (materials > 0) {
                        const produceQty = Math.min(materials, getManufacturingCapacity(company));
                        totalCost += produceQty * 5;
                        wip += produceQty;
                        materials -= produceQty;
                    }
                    break;

                case 'conservative':
                    // 在庫を維持しつつ売る
                    if (products > 2) {
                        const sellQty = Math.min(products - 2, getSalesCapacity(company));
                        totalRevenue += sellQty * salesPrice;
                        products -= sellQty;
                    }
                    // 完成
                    if (wip > 0) {
                        const completeQty = Math.min(wip, getManufacturingCapacity(company));
                        products += completeQty;
                        wip -= completeQty;
                    }
                    break;

                case 'investment':
                    // 在庫を積み上げる
                    if (materials > 0) {
                        const produceQty = Math.min(materials, getManufacturingCapacity(company));
                        totalCost += produceQty * 5;
                        wip += produceQty;
                        materials -= produceQty;
                    }
                    if (wip > 0) {
                        const completeQty = Math.min(wip, getManufacturingCapacity(company));
                        products += completeQty;
                        wip -= completeQty;
                    }
                    break;
            }
        }

        // 期待G計算（簡易）
        const pq = totalRevenue;
        const vq = totalCost + (state.materials - materials) * 13 +
                   (state.wip - wip) * 14 + (state.products - products) * 15;
        const mq = pq - vq;

        return {
            expectedG: mq,
            finalCash: cash + totalRevenue - totalCost,
            finalInventory: materials + wip + products,
            totalRevenue,
            totalCost
        };
    },

    // ========================================
    // === 強化AI機能: 動的戦略調整 ===
    // ========================================

    /**
     * 現在のゲーム状況に応じて戦略を動的調整
     */
    dynamicStrategyAdjustment: function(company, companyIndex) {
        const competitors = this.analyzeCompetitors(company, companyIndex);
        const period = gameState.currentPeriod;
        const rowsRemaining = gameState.maxRows - (company.currentRow || 1);

        let adjustment = {
            aggressiveness: 0.5, // 0-1
            investmentFocus: 0.5,
            riskTolerance: 0.5
        };

        // 順位に応じた調整
        if (competitors.myRank === 1) {
            // 1位：守りを固める
            adjustment.aggressiveness = 0.3;
            adjustment.riskTolerance = 0.3;
        } else if (competitors.myRank >= 4) {
            // 下位：リスクを取って挽回
            adjustment.aggressiveness = 0.9;
            adjustment.riskTolerance = 0.8;
        }

        // 期に応じた調整
        if (period === 2) {
            // 2期は投資重視
            adjustment.investmentFocus = 0.8;
        } else if (period === 5) {
            // 5期は目標達成とG最大化
            adjustment.investmentFocus = 0.3;
            adjustment.aggressiveness = 0.6;
        }

        // 現金状況に応じた調整
        const periodPayment = calculatePeriodPayment(company);
        if (company.cash < periodPayment * 1.5) {
            // 現金不足：保守的に
            adjustment.riskTolerance = 0.2;
            adjustment.aggressiveness = 0.8; // 売上優先
        }

        // 期末が近い場合
        if (rowsRemaining <= 5) {
            adjustment.aggressiveness = 0.9;
        }

        // リーダーとの差に応じた調整
        const leaderGap = competitors.leader.equity - company.equity;
        if (leaderGap > 50) {
            // 大きく離されている：ハイリスクハイリターン
            adjustment.riskTolerance = 0.9;
            adjustment.aggressiveness = 0.9;
        }

        return {
            ...adjustment,
            reasoning: this.explainAdjustment(adjustment, competitors, company)
        };
    },

    explainAdjustment: function(adj, competitors, company) {
        const reasons = [];
        if (adj.aggressiveness > 0.7) reasons.push('積極的販売モード');
        if (adj.investmentFocus > 0.6) reasons.push('投資重視モード');
        if (adj.riskTolerance < 0.4) reasons.push('リスク回避モード');
        if (competitors.myRank === 1) reasons.push('首位防衛');
        if (competitors.myRank >= 4) reasons.push('挽回モード');
        return reasons.join('、') || '通常モード';
    },

    // ========================================
    // === 強化AI機能: 期待値ベース意思決定 ===
    // ========================================

    /**
     * アクションの期待値を計算
     */
    calculateActionExpectedValue: function(company, action, companyIndex) {
        const period = gameState.currentPeriod;

        switch (action.type) {
            case 'SELL':
                return this.calculateSellExpectedValue(company, action.quantity, companyIndex);
            case 'BID':
                return this.calculateBidExpectedValue(company, action.price, action.quantity, companyIndex);
            case 'BUY_CHIP':
                return this.calculateChipExpectedValue(company, action.chipType, companyIndex);
            case 'PRODUCE':
                return this.calculateProduceExpectedValue(company, action.quantity);
            case 'COMPLETE':
                return this.calculateCompleteExpectedValue(company, action.quantity);
            default:
                return { expectedValue: 0, variance: 0 };
        }
    },

    calculateSellExpectedValue: function(company, quantity, companyIndex) {
        const basePrice = 40;
        const researchBonus = (company.chips.research || 0) * 2;
        const price = basePrice + researchBonus;

        // 市場の空き状況を考慮（全市場の空きを合計）
        const markets = gameState.markets || [];
        const totalMarketSpace = markets.reduce((sum, m) => {
            if (!m || m.closed) return sum;
            return sum + ((m.maxStock || 0) - (m.currentStock || 0));
        }, 0);
        const actualQuantity = Math.min(quantity, totalMarketSpace);

        // 変動費（製品評価額15円）
        const variableCost = actualQuantity * 15;

        // MQ貢献（売上 - 変動費）
        const mqContribution = (actualQuantity * price) - variableCost;

        return {
            expectedValue: mqContribution,
            revenue: actualQuantity * price,
            cost: variableCost,
            certainty: 0.95 // ほぼ確実
        };
    },

    calculateBidExpectedValue: function(company, price, quantity, companyIndex) {
        const optimalBid = this.calculateOptimalBidPrice(company, companyIndex, price);

        // 勝率を推定
        let winProbability = 0.5;
        if (price > optimalBid.maxRivalPrice) {
            winProbability = 0.85;
        } else if (price === optimalBid.maxRivalPrice) {
            winProbability = company.chips.research > optimalBid.rivalMaxResearch ? 0.7 : 0.3;
        } else {
            winProbability = 0.2;
        }

        // 勝った場合の期待MQ貢献
        // 材料13円で仕入れ → 製品15円で在庫 → 40+円で販売
        // 期待利益 = 販売価格 - 仕入価格 - 製造費(5+5)
        const expectedProfit = winProbability * quantity * ((40 + (company.chips.research || 0) * 2) - price - 10);

        return {
            expectedValue: expectedProfit,
            winProbability,
            cost: price * quantity,
            certainty: optimalBid.confidence
        };
    },

    calculateChipExpectedValue: function(company, chipType, companyIndex) {
        const period = gameState.currentPeriod;
        const remainingPeriods = 5 - period + 1;

        // チップ別のROI計算
        switch (chipType) {
            case 'research':
                // 研究チップ: +2円/製品 × 残り期間の予想販売数
                const expectedSales = (company.salesmen + 1) * 10 * remainingPeriods;
                const revenueIncrease = expectedSales * 2;
                const cost = period === 2 ? 20 : 30; // 2期は通常、3期以降は特急
                return {
                    expectedValue: revenueIncrease - cost,
                    roi: (revenueIncrease - cost) / cost,
                    certainty: 0.7
                };

            case 'education':
                // 教育チップ: 効果は1枚のみ
                if ((company.chips.education || 0) >= 1) {
                    return { expectedValue: -30, roi: -1, certainty: 1.0 }; // 2枚目以降は無駄
                }
                // +1製造/+1販売 = 約+3製品/期 × 残り期間
                const extraProducts = 3 * remainingPeriods;
                const educationValue = extraProducts * 25; // 製品あたり粗利約25円
                const eduCost = period === 2 ? 20 : 30;
                return {
                    expectedValue: educationValue - eduCost,
                    roi: (educationValue - eduCost) / eduCost,
                    certainty: 0.6
                };

            case 'advertising':
                // 広告チップ: +2販売/枚（セールスマン数まで）
                const currentAd = company.chips.advertising || 0;
                if (currentAd >= company.salesmen) {
                    return { expectedValue: -30, roi: -1, certainty: 1.0 }; // 効果上限
                }
                const extraSales = 2 * remainingPeriods;
                const adValue = extraSales * 25;
                const adCost = period === 2 ? 20 : 30;
                return {
                    expectedValue: adValue - adCost,
                    roi: (adValue - adCost) / adCost,
                    certainty: 0.65
                };

            default:
                return { expectedValue: 0, roi: 0, certainty: 0 };
        }
    },

    calculateProduceExpectedValue: function(company, quantity) {
        // 投入コスト5円/個
        const cost = quantity * 5;
        // 材料13円 → 仕掛品14円（在庫評価増+1円）
        const inventoryValueIncrease = quantity * 1;

        return {
            expectedValue: inventoryValueIncrease - cost,
            certainty: 1.0 // 確実
        };
    },

    calculateCompleteExpectedValue: function(company, quantity) {
        // 完成コスト5円/個
        const cost = quantity * 5;
        // 仕掛品14円 → 製品15円（在庫評価増+1円）
        const inventoryValueIncrease = quantity * 1;

        return {
            expectedValue: inventoryValueIncrease - cost,
            certainty: 1.0 // 確実
        };
    },

    /**
     * 全可能アクションの期待値を比較し、最適を選択
     */
    selectOptimalAction: function(company, companyIndex) {
        const possibleActions = this.enumeratePossibleActions(company, companyIndex);

        const evaluated = possibleActions.map(action => ({
            action,
            ev: this.calculateActionExpectedValue(company, action, companyIndex)
        }));

        // 期待値でソート
        evaluated.sort((a, b) => b.ev.expectedValue - a.ev.expectedValue);

        return {
            recommended: evaluated[0],
            alternatives: evaluated.slice(1, 4),
            allOptions: evaluated
        };
    },

    /**
     * 可能なアクションを列挙
     */
    enumeratePossibleActions: function(company, companyIndex) {
        const actions = [];

        // 販売
        if (company.products > 0 && getSalesCapacity(company) > 0) {
            for (let q = 1; q <= Math.min(company.products, getSalesCapacity(company)); q++) {
                actions.push({ type: 'SELL', quantity: q });
            }
        }

        // 完成
        if (company.wip > 0 && getManufacturingCapacity(company) > 0) {
            for (let q = 1; q <= Math.min(company.wip, getManufacturingCapacity(company)); q++) {
                actions.push({ type: 'COMPLETE', quantity: q });
            }
        }

        // 投入
        if (company.materials > 0 && getManufacturingCapacity(company) > 0) {
            for (let q = 1; q <= Math.min(company.materials, getManufacturingCapacity(company)); q++) {
                actions.push({ type: 'PRODUCE', quantity: q });
            }
        }

        // チップ購入
        if (company.cash > 30) {
            actions.push({ type: 'BUY_CHIP', chipType: 'research' });
            actions.push({ type: 'BUY_CHIP', chipType: 'education' });
            actions.push({ type: 'BUY_CHIP', chipType: 'advertising' });
        }

        // 待機
        actions.push({ type: 'WAIT' });

        return actions;
    },

    // ========================================
    // === 超強化AI: 学習機能強化 ===
    // ========================================

    /**
     * ゲーム中の行動履歴を記録（学習用）
     */
    recordAction: function(companyIndex, action, result) {
        const data = this.loadLearningData();
        if (!data.actionHistory) {
            data.actionHistory = [];
        }

        data.actionHistory.push({
            period: gameState.currentPeriod,
            row: gameState.companies[companyIndex]?.currentRow || 1,
            company: companyIndex,
            action: action,
            result: result,
            timestamp: Date.now()
        });

        // 直近100件のみ保持
        if (data.actionHistory.length > 100) {
            data.actionHistory = data.actionHistory.slice(-100);
        }

        this.saveLearningData();
    },

    /**
     * 過去の成功パターンを分析
     */
    analyzeSuccessPatterns: function(companyIndex) {
        const data = this.loadLearningData();
        const history = data.actionHistory || [];
        const company = gameState.companies[companyIndex];
        const strategy = company.strategy || 'balanced';

        // 戦略別の成功率を計算
        const strategyStats = data.strategyWinRates[strategy] || { wins: 0, games: 0, avgEquity: 300 };
        const winRate = strategyStats.games > 0 ? strategyStats.wins / strategyStats.games : 0.5;

        // 期別の最適行動パターン
        const periodPatterns = {
            2: { chipPriority: 'research', productionTiming: 'early' },
            3: { chipPriority: 'next_period', productionTiming: 'balanced' },
            4: { chipPriority: 'next_period', productionTiming: 'aggressive' },
            5: { chipPriority: 'clear_condition', productionTiming: 'inventory_focus' }
        };

        return {
            winRate,
            avgEquity: strategyStats.avgEquity,
            recommendedPattern: periodPatterns[gameState.currentPeriod] || periodPatterns[3],
            confidence: Math.min(0.9, 0.5 + strategyStats.games * 0.05)
        };
    },

    /**
     * 学習に基づく戦略パラメータ調整
     */
    getLearnedStrategyAdjustment: function(company, companyIndex) {
        const data = this.loadLearningData();
        const strategy = company.strategy || 'balanced';
        const stats = data.strategyWinRates[strategy];

        // 勝率が低い場合は戦略パラメータを調整
        if (stats && stats.games >= 3) {
            const winRate = stats.wins / stats.games;

            if (winRate < 0.3) {
                // 勝率低い：より積極的に
                return {
                    aggressivenessBonus: 0.2,
                    riskToleranceBonus: 0.1,
                    researchChipBonus: 1
                };
            } else if (winRate > 0.7) {
                // 勝率高い：現状維持
                return {
                    aggressivenessBonus: 0,
                    riskToleranceBonus: 0,
                    researchChipBonus: 0
                };
            }
        }

        return {
            aggressivenessBonus: 0,
            riskToleranceBonus: 0,
            researchChipBonus: 0
        };
    },

    // ========================================
    // === 超強化AI: 相手戦略タイプ推定 ===
    // ========================================

    /**
     * 相手の行動パターンから戦略タイプを推定
     */
    estimateOpponentStrategy: function(opponentIndex) {
        const opponent = gameState.companies[opponentIndex];
        if (!opponent) return 'balanced';

        // 行動パターンの分析
        const indicators = {
            aggressive: 0,
            conservative: 0,
            balanced: 0,
            price_focused: 0,
            tech_focused: 0
        };

        // 研究チップ数で判定
        const researchChips = opponent.chips.research || 0;
        if (researchChips >= 4) {
            indicators.tech_focused += 3;
            indicators.aggressive += 2;
        } else if (researchChips >= 2) {
            indicators.balanced += 2;
        } else {
            indicators.conservative += 2;
        }

        // 広告チップ数で判定
        const adChips = opponent.chips.advertising || 0;
        if (adChips >= 2) {
            indicators.price_focused += 3;
        }

        // 現金保有量で判定
        const periodPayment = calculatePeriodPayment(opponent);
        const cashRatio = opponent.cash / Math.max(periodPayment, 1);
        if (cashRatio > 2) {
            indicators.conservative += 2;
        } else if (cashRatio < 1.2) {
            indicators.aggressive += 2;
        }

        // 在庫量で判定
        const totalInventory = opponent.materials + opponent.wip + opponent.products;
        if (totalInventory > 15) {
            indicators.conservative += 1;
        } else if (totalInventory < 5) {
            indicators.aggressive += 2;
        }

        // 最も高いスコアの戦略を返す
        let maxScore = 0;
        let estimatedStrategy = 'balanced';
        for (const [strategy, score] of Object.entries(indicators)) {
            if (score > maxScore) {
                maxScore = score;
                estimatedStrategy = strategy;
            }
        }

        return estimatedStrategy;
    },

    /**
     * 相手の次の行動を高精度で予測
     */
    predictOpponentNextAction: function(opponentIndex) {
        const opponent = gameState.companies[opponentIndex];
        if (!opponent) return { action: 'UNKNOWN', probability: 0 };

        const estimatedStrategy = this.estimateOpponentStrategy(opponentIndex);
        const period = gameState.currentPeriod;
        const mfgCapacity = getManufacturingCapacity(opponent);
        const salesCapacity = getSalesCapacity(opponent);
        const periodPayment = calculatePeriodPayment(opponent);

        // 状況に基づく予測
        const predictions = [];

        // 緊急販売チェック
        if (opponent.cash < periodPayment && opponent.products > 0) {
            predictions.push({ action: 'EMERGENCY_SELL', probability: 0.95 });
        }

        // 5期クリア条件チェック
        if (period === 5) {
            const totalInv = opponent.materials + opponent.wip + opponent.products;
            const nextChips = (opponent.nextPeriodChips?.research || 0) +
                              (opponent.nextPeriodChips?.education || 0) +
                              (opponent.nextPeriodChips?.advertising || 0);

            if (nextChips < 3 && opponent.cash >= 60) {
                predictions.push({ action: 'BUY_NEXT_CHIP', probability: 0.9 });
            }
            if (totalInv < 10) {
                predictions.push({ action: 'BUILD_INVENTORY', probability: 0.85 });
            }
        }

        // 戦略別の傾向
        switch (estimatedStrategy) {
            case 'aggressive':
                if (opponent.products > 0 && salesCapacity > 0) {
                    predictions.push({ action: 'SELL', probability: 0.8 });
                }
                break;
            case 'conservative':
                if (opponent.cash > periodPayment * 2) {
                    predictions.push({ action: 'HOLD_CASH', probability: 0.7 });
                }
                break;
            case 'tech_focused':
                if (opponent.chips.research < 5 && opponent.cash > 50) {
                    predictions.push({ action: 'BUY_RESEARCH', probability: 0.75 });
                }
                break;
        }

        // 基本行動
        if (opponent.products > 0 && salesCapacity > 0) {
            predictions.push({ action: 'SELL', probability: 0.6 });
        }
        if (opponent.wip > 0 && mfgCapacity > 0) {
            predictions.push({ action: 'COMPLETE', probability: 0.5 });
        }
        if (opponent.materials > 0 && mfgCapacity > 0) {
            predictions.push({ action: 'PRODUCE', probability: 0.4 });
        }

        // 最も確率が高い予測を返す
        predictions.sort((a, b) => b.probability - a.probability);
        return predictions[0] || { action: 'WAIT', probability: 0.3 };
    },

    // ========================================
    // === 超強化AI: モンテカルロシミュレーション ===
    // ========================================

    /**
     * モンテカルロ法による最適行動の決定
     * @param {number} simulations シミュレーション回数
     */
    monteCarloDecision: function(company, companyIndex, simulations = 50) {
        const possibleActions = this.enumeratePossibleActions(company, companyIndex);
        const results = {};

        // 各アクションについてシミュレーション
        for (const action of possibleActions) {
            results[action.type + '_' + (action.quantity || action.chipType || '')] = {
                action,
                totalValue: 0,
                simCount: 0
            };
        }

        // シミュレーション実行
        for (let sim = 0; sim < simulations; sim++) {
            for (const action of possibleActions) {
                const key = action.type + '_' + (action.quantity || action.chipType || '');
                const value = this.simulateActionOutcome(company, action, companyIndex);
                results[key].totalValue += value;
                results[key].simCount++;
            }
        }

        // 平均値を計算し、最適アクションを選択
        let bestAction = null;
        let bestValue = -Infinity;

        for (const key in results) {
            const avgValue = results[key].totalValue / results[key].simCount;
            if (avgValue > bestValue) {
                bestValue = avgValue;
                bestAction = results[key].action;
            }
        }

        return {
            recommendedAction: bestAction,
            expectedValue: bestValue,
            confidence: Math.min(0.95, 0.7 + simulations / 200),
            simulationCount: simulations
        };
    },

    /**
     * 単一アクションの結果をシミュレート（ランダム要素含む）
     */
    simulateActionOutcome: function(company, action, companyIndex) {
        const period = gameState.currentPeriod;
        const remainingRows = gameState.maxRows - (company.currentRow || 1);

        // ベース価値
        let value = 0;

        // ランダム要素（リスクカードの影響など）
        const riskFactor = 0.9 + Math.random() * 0.2; // 0.9-1.1

        switch (action.type) {
            case 'SELL':
                const basePrice = 40 + (company.chips.research || 0) * 2;
                const sellValue = action.quantity * basePrice * riskFactor;
                const variableCost = action.quantity * 15;
                value = sellValue - variableCost;
                break;

            case 'COMPLETE':
                // 完成による在庫価値増加
                value = (action.quantity * 1 - action.quantity * 5) * riskFactor;
                // 将来の販売機会の価値
                value += action.quantity * 20 * (remainingRows / gameState.maxRows);
                break;

            case 'PRODUCE':
                value = (action.quantity * 1 - action.quantity * 5) * riskFactor;
                value += action.quantity * 15 * (remainingRows / gameState.maxRows);
                break;

            case 'BUY_CHIP':
                const remainingPeriods = 5 - period + 1;
                if (action.chipType === 'research') {
                    // 研究チップ：価格競争力+2 × 予想販売数
                    const expectedSales = (company.salesmen + 1) * 8 * remainingPeriods;
                    value = (expectedSales * 2 - (period === 2 ? 20 : 30)) * riskFactor;
                } else if (action.chipType === 'education') {
                    if ((company.chips.education || 0) >= 1) {
                        value = -50; // 2枚目以降は無駄
                    } else {
                        value = (remainingPeriods * 3 * 20 - (period === 2 ? 20 : 30)) * riskFactor;
                    }
                } else if (action.chipType === 'advertising') {
                    if ((company.chips.advertising || 0) >= company.salesmen) {
                        value = -30;
                    } else {
                        value = (remainingPeriods * 2 * 20 - (period === 2 ? 20 : 30)) * riskFactor;
                    }
                }
                break;

            case 'WAIT':
                value = 0;
                break;

            default:
                value = 0;
        }

        return value;
    },

    // ========================================
    // === 超強化AI: ゲーム理論最適化 ===
    // ========================================

    /**
     * ナッシュ均衡に近い戦略を計算
     * 他プレイヤーの行動を考慮した最適応答を計算
     */
    calculateBestResponse: function(company, companyIndex) {
        try {
            const competitors = this.analyzeCompetitors(company, companyIndex);
            const myActions = this.enumeratePossibleActions(company, companyIndex);

        // 各競合の予測行動を取得
        const opponentPredictions = [];
        for (let i = 0; i < gameState.companies.length; i++) {
            if (i !== companyIndex) {
                opponentPredictions.push({
                    index: i,
                    prediction: this.predictOpponentNextAction(i)
                });
            }
        }

        // 各自社アクションについて、競合の予測行動を考慮した期待利得を計算
        const actionPayoffs = myActions.map(action => {
            let expectedPayoff = 0;

            // 基本的な期待値
            const baseEV = this.calculateActionExpectedValue(company, action, companyIndex);
            expectedPayoff += baseEV.expectedValue;

            // 競合の行動による影響
            for (const op of opponentPredictions) {
                const opAction = op.prediction.action;
                const opProb = op.prediction.probability;

                // 競合が販売する場合、市場枠が減る
                if (opAction === 'SELL' && action.type === 'SELL') {
                    expectedPayoff -= opProb * action.quantity * 5; // 競合による市場圧迫
                }

                // 競合が研究チップを買う場合、将来の入札競争が激化
                if (opAction === 'BUY_RESEARCH' && action.type === 'SELL') {
                    expectedPayoff -= opProb * 3; // 将来の価格競争力低下
                }

                // 競合が在庫を積む場合、将来の販売圧力
                if ((opAction === 'COMPLETE' || opAction === 'PRODUCE') && action.type === 'SELL') {
                    expectedPayoff += opProb * 2; // 今売った方が有利
                }
            }

            return {
                action,
                expectedPayoff,
                baseEV: baseEV.expectedValue
            };
        });

        // 最適応答を選択
        actionPayoffs.sort((a, b) => b.expectedPayoff - a.expectedPayoff);

        return {
            bestResponse: actionPayoffs[0] || { action: { type: 'WAIT' }, expectedPayoff: 0 },
            alternatives: actionPayoffs.slice(1, 3),
            gameTheoreticAnalysis: true
        };
        } catch (error) {
            console.error('[AIBrain] calculateBestResponse エラー:', error);
            return {
                bestResponse: { action: { type: 'WAIT' }, expectedPayoff: 0 },
                alternatives: [],
                gameTheoreticAnalysis: false,
                error: error.message
            };
        }
    },

    /**
     * 混合戦略の計算（確率的な行動選択）
     */
    calculateMixedStrategy: function(company, companyIndex) {
        const bestResponse = this.calculateBestResponse(company, companyIndex);
        const mcDecision = this.monteCarloDecision(company, companyIndex, 30);

        // ゲーム理論とモンテカルロの結果を統合
        const combined = [];

        // ベストレスポンスの上位3アクションに確率を割り当て
        if (bestResponse.bestResponse) {
            combined.push({
                action: bestResponse.bestResponse.action,
                probability: 0.5,
                source: 'game_theory'
            });
        }

        if (mcDecision.recommendedAction) {
            // モンテカルロ推奨が異なる場合は追加
            const mcKey = mcDecision.recommendedAction.type;
            const brKey = bestResponse.bestResponse?.action.type;

            if (mcKey !== brKey) {
                combined.push({
                    action: mcDecision.recommendedAction,
                    probability: 0.3,
                    source: 'monte_carlo'
                });
            } else {
                // 同じなら確率を上げる
                combined[0].probability = 0.7;
            }
        }

        // 探索的な行動（たまにランダムな選択）
        combined.push({
            action: { type: 'EXPLORE' },
            probability: 0.1,
            source: 'exploration'
        });

        return combined;
    },

    /**
     * 統合的な最適意思決定（全手法を組み合わせ）
     */
    makeOptimalDecision: function(company, companyIndex) {
        try {
            const period = gameState.currentPeriod;

            // 1. 学習データからの調整を取得
            const learnedAdj = this.getLearnedStrategyAdjustment(company, companyIndex);
            const successPatterns = this.analyzeSuccessPatterns(companyIndex);

            // 2. ゲーム理論による最適応答
            const gameTheory = this.calculateBestResponse(company, companyIndex);

        // 3. モンテカルロシミュレーション
        const monteCarlo = this.monteCarloDecision(company, companyIndex, 30);

        // 4. 期待値ベースの選択
        const evBased = this.selectOptimalAction(company, companyIndex);

        // 5. 動的調整
        const dynamicAdj = this.dynamicStrategyAdjustment(company, companyIndex);

        // 結果を統合（重み付け投票）
        const votes = {};

        // ゲーム理論（重み0.35）
        if (gameTheory.bestResponse) {
            const key = gameTheory.bestResponse.action.type;
            votes[key] = (votes[key] || 0) + 0.35 * gameTheory.bestResponse.expectedPayoff;
        }

        // モンテカルロ（重み0.30）
        if (monteCarlo.recommendedAction) {
            const key = monteCarlo.recommendedAction.type;
            votes[key] = (votes[key] || 0) + 0.30 * monteCarlo.expectedValue;
        }

        // 期待値ベース（重み0.25）
        if (evBased.recommended) {
            const key = evBased.recommended.action.type;
            votes[key] = (votes[key] || 0) + 0.25 * evBased.recommended.ev.expectedValue;
        }

        // 学習パターン（重み0.10）
        if (successPatterns.recommendedPattern) {
            const pattern = successPatterns.recommendedPattern;
            if (pattern.productionTiming === 'aggressive') {
                votes['SELL'] = (votes['SELL'] || 0) + 0.10 * 50;
            } else if (pattern.chipPriority === 'research') {
                votes['BUY_CHIP'] = (votes['BUY_CHIP'] || 0) + 0.10 * 30;
            }
        }

        // 最高投票のアクションを選択
        let bestAction = null;
        let bestScore = -Infinity;
        for (const [actionType, score] of Object.entries(votes)) {
            if (score > bestScore) {
                bestScore = score;
                bestAction = actionType;
            }
        }

        // 詳細なアクションオブジェクトを取得
        let finalAction = null;
        if (bestAction === gameTheory.bestResponse?.action.type) {
            finalAction = gameTheory.bestResponse.action;
        } else if (bestAction === monteCarlo.recommendedAction?.type) {
            finalAction = monteCarlo.recommendedAction;
        } else if (bestAction === evBased.recommended?.action.type) {
            finalAction = evBased.recommended.action;
        }

        return {
            action: finalAction || { type: 'WAIT' },
            score: bestScore,
            confidence: Math.min(0.95, (successPatterns.confidence + monteCarlo.confidence) / 2),
            reasoning: {
                gameTheory: gameTheory.bestResponse?.expectedPayoff || 0,
                monteCarlo: monteCarlo.expectedValue || 0,
                evBased: evBased.recommended?.ev.expectedValue || 0,
                dynamicMode: dynamicAdj.reasoning
            }
        };
        } catch (error) {
            console.error('[AIBrain] makeOptimalDecision エラー:', error);
            return {
                action: { type: 'WAIT' },
                score: 0,
                confidence: 0.3,
                reasoning: { error: error.message }
            };
        }
    },

    // ========================================
    // === 究極AI: リスクカード確率モデル（全64枚対応） ===
    // ========================================

    /**
     * リスクカードの確率分布（全64枚）
     * 戦略的に重要なカードには strategicNote を追加
     */
    RISK_CARD_PROBABILITIES: {
        // 各カードの出現確率（64枚中の枚数）
        'クレーム発生': { count: 2, probability: 2/64, impact: -5, type: 'cost', fCost: true },
        '教育成功': { count: 2, probability: 2/64, impact: 0, type: 'benefit', requires: 'education',
            strategicNote: '教育チップ保有時: 販売能力の範囲内で最高5個を32円で販売可能' },
        '消費者運動発生': { count: 2, probability: 2/64, impact: 0, type: 'cost',
            strategicNote: '販売不可になる。製品を持ちすぎない方が安全' },
        '得意先倒産': { count: 2, probability: 2/64, impact: -30, type: 'cost', period2Exempt: true },
        '研究開発失敗': { count: 3, probability: 3/64, impact: 0, type: 'cost', affectsChip: 'research',
            strategicNote: '研究チップ1枚返却。研究チップを多く持つリスク' },
        '広告成功': { count: 3, probability: 3/64, impact: 0, type: 'benefit', requires: 'advertising',
            strategicNote: '広告チップ1枚につき2個まで独占販売（最高5個、32円）' },
        '労災発生': { count: 2, probability: 2/64, impact: 0, type: 'cost',
            strategicNote: '生産不可。材料・仕掛品が滞留するリスク' },
        '広告政策失敗': { count: 2, probability: 2/64, impact: 0, type: 'cost', affectsChip: 'advertising',
            strategicNote: '広告チップ1枚返却' },
        '特別サービス': { count: 2, probability: 2/64, impact: 15, type: 'benefit',
            strategicNote: '材料10円×5個 or 広告チップ20円×2個購入可' },
        '返品発生': { count: 3, probability: 3/64, impact: -20, type: 'cost', period2Exempt: true,
            strategicNote: '市場から製品1個戻り、売上-20円' },
        'コンピュータートラブル': { count: 2, probability: 2/64, impact: -10, type: 'cost', fCost: true },
        '商品の独占販売': { count: 3, probability: 3/64, impact: 0, type: 'benefit',
            strategicNote: 'セールスマン1人につき2個まで32円で販売可（最高5個）' },
        '製造ミス発生': { count: 2, probability: 2/64, impact: -14, type: 'cost',
            strategicNote: '仕掛品1個没収（14円の損失）' },
        '倉庫火災': { count: 2, probability: 2/64, impact: 0, type: 'cost', mitigatedBy: 'insurance',
            strategicNote: '材料全没収！保険あれば1個8円の保険金。材料を溜め込まない方が安全' },
        '縁故採用': { count: 2, probability: 2/64, impact: -5, type: 'cost', fCost: true },
        '研究開発成功': { count: 6, probability: 6/64, impact: 0, type: 'benefit', requires: 'research',
            strategicNote: '研究チップ1枚につき2個まで32円で販売（最高5個）。最も出やすいベネフィット！' },
        '各社共通': { count: 2, probability: 2/64, impact: 6, type: 'special',
            strategicNote: '全員が3個まで12円で材料購入可' },
        'ストライキ発生': { count: 2, probability: 2/64, impact: -25, type: 'cost',
            strategicNote: '1回休み。行動機会の損失' },
        '盗難発見': { count: 2, probability: 2/64, impact: 0, type: 'cost', mitigatedBy: 'insurance',
            strategicNote: '製品2個没収！保険あれば1個10円の保険金。製品を溜め込まない方が安全' },
        '長期労務紛争': { count: 2, probability: 2/64, impact: -50, type: 'cost',
            strategicNote: '2回休み。最悪のカードの一つ' },
        '設計トラブル発生': { count: 2, probability: 2/64, impact: -10, type: 'cost', fCost: true },
        'ワーカー退職': { count: 2, probability: 2/64, impact: -5, type: 'cost',
            strategicNote: '労務費+5円、ワーカー減少で製造能力低下' },
        '景気変動': { count: 2, probability: 2/64, impact: 0, type: 'special',
            strategicNote: 'ターン順が逆回りに。順番優位が変わる' },
        '教育失敗': { count: 2, probability: 2/64, impact: 0, type: 'cost', affectsChip: 'education',
            strategicNote: '教育チップ1枚返却。教育チップ複数持つリスク' },
        'セールスマン退職': { count: 2, probability: 2/64, impact: -5, type: 'cost',
            strategicNote: '本社人件費+5円、販売能力低下' },
        '社長、病気で倒れる': { count: 2, probability: 2/64, impact: -25, type: 'cost',
            strategicNote: '1回休み' },
        '不良在庫発生': { count: 2, probability: 2/64, impact: 0, type: 'cost',
            strategicNote: '★重要★ 在庫20個超過分は全没収！在庫は必ず20以下に維持すべき！' },
        '機械故障': { count: 2, probability: 2/64, impact: -5, type: 'cost', fCost: true }
    },

    /**
     * 戦略的リスク判定：在庫20個制限
     */
    checkInventoryRisk: function(company) {
        const totalInventory = company.materials + company.wip + company.products;
        const excessRisk = totalInventory > 20;
        const nearLimit = totalInventory >= 18;

        return {
            totalInventory,
            isOverLimit: totalInventory > 20,
            excessAmount: Math.max(0, totalInventory - 20),
            riskLevel: excessRisk ? 'critical' : nearLimit ? 'warning' : 'safe',
            recommendation: excessRisk ?
                `緊急！在庫${totalInventory}個 → 不良在庫発生で${totalInventory - 20}個没収リスク` :
                nearLimit ?
                    `注意: 在庫${totalInventory}個。20個上限に近い` :
                    `安全: 在庫${totalInventory}個`
        };
    },

    /**
     * 戦略的リスク判定：保険チップの価値
     */
    calculateInsuranceValue: function(company) {
        const materials = company.materials || 0;
        const products = company.products || 0;

        // 倉庫火災リスク: 材料全没収（保険なら8円/個回収）
        const fireRisk = (2/64) * materials * 13; // 期待損失
        const fireInsuranceValue = (2/64) * materials * 8; // 保険の期待価値

        // 盗難リスク: 製品2個没収（保険なら10円/個回収）
        const theftRisk = (2/64) * Math.min(products, 2) * 15; // 期待損失
        const theftInsuranceValue = (2/64) * Math.min(products, 2) * 10; // 保険の期待価値

        const totalRiskWithoutInsurance = fireRisk + theftRisk;
        const totalRiskReduction = fireInsuranceValue + theftInsuranceValue;
        const insuranceCost = 5; // 保険チップのコスト

        return {
            fireRisk,
            theftRisk,
            totalRiskWithoutInsurance,
            insuranceValue: totalRiskReduction,
            netBenefit: totalRiskReduction - insuranceCost,
            shouldBuyInsurance: materials >= 5 || products >= 4,
            reasoning: `材料${materials}個・製品${products}個 → 期待損失${totalRiskWithoutInsurance.toFixed(1)}円`
        };
    },

    /**
     * 戦略的リスク判定：チップ返却リスク
     */
    calculateChipReturnRisk: function(company) {
        const research = company.chips.research || 0;
        const education = company.chips.education || 0;
        const advertising = company.chips.advertising || 0;

        // 研究開発失敗: 3/64 で研究チップ1枚返却
        const researchReturnProb = 3/64;
        const researchReturnRisk = research > 0 ? researchReturnProb * 20 : 0; // チップ価値約20円

        // 教育失敗: 2/64 で教育チップ1枚返却
        const educationReturnProb = 2/64;
        const educationReturnRisk = education > 0 ? educationReturnProb * 20 : 0;

        // 広告政策失敗: 2/64 で広告チップ1枚返却
        const advertisingReturnProb = 2/64;
        const advertisingReturnRisk = advertising > 0 ? advertisingReturnProb * 20 : 0;

        return {
            research: {
                count: research,
                returnRisk: researchReturnRisk,
                successBenefit: (6/64) * research * 2 * 32, // 研究成功の期待値
                netExpected: (6/64) * research * 2 * 32 - researchReturnRisk
            },
            education: {
                count: education,
                returnRisk: educationReturnRisk,
                successBenefit: (2/64) * Math.min(education, 1) * 3 * 32, // 教育成功の期待値（効果1枚まで）
                netExpected: (2/64) * Math.min(education, 1) * 3 * 32 - educationReturnRisk
            },
            advertising: {
                count: advertising,
                returnRisk: advertisingReturnRisk,
                successBenefit: (3/64) * advertising * 2 * 32, // 広告成功の期待値
                netExpected: (3/64) * advertising * 2 * 32 - advertisingReturnRisk
            },
            recommendation: this.getChipRecommendation(research, education, advertising)
        };
    },

    getChipRecommendation: function(research, education, advertising) {
        const recommendations = [];

        // 研究チップは最も有利（成功6枚 vs 失敗3枚 = 2:1）
        if (research < 4) {
            recommendations.push('研究チップ推奨（成功率2倍）');
        }

        // 教育チップは1枚で十分
        if (education === 0) {
            recommendations.push('教育チップ1枚推奨');
        } else if (education >= 2) {
            recommendations.push('教育チップ2枚以上は非効率（効果は1枚分のみ）');
        }

        // 広告チップはセールスマン数まで
        return recommendations.join('、') || 'チップバランス良好';
    },

    // ========================================
    // === リスクカード履歴観察システム ===
    // ========================================

    /**
     * 既出リスクカードを分析
     * 誰が何のカードを引いたかを観察し、残りカードの確率を更新
     */
    analyzeDrawnRiskCards: function() {
        const usedCardIds = gameState.usedRiskCards || [];
        const totalCards = 64;
        const remainingCards = totalCards - usedCardIds.length;

        // カード名ごとの既出枚数をカウント
        const drawnCounts = {};
        for (const id of usedCardIds) {
            const card = RISK_CARDS.find(c => c.id === id);
            if (card) {
                drawnCounts[card.name] = (drawnCounts[card.name] || 0) + 1;
            }
        }

        // 残り枚数と更新された確率を計算
        const cardAnalysis = {};
        for (const [cardName, baseData] of Object.entries(this.RISK_CARD_PROBABILITIES)) {
            const drawn = drawnCounts[cardName] || 0;
            const remaining = baseData.count - drawn;
            const updatedProbability = remainingCards > 0 ? remaining / remainingCards : 0;

            cardAnalysis[cardName] = {
                ...baseData,
                originalCount: baseData.count,
                drawnCount: drawn,
                remainingCount: remaining,
                originalProbability: baseData.probability,
                currentProbability: updatedProbability,
                isExhausted: remaining <= 0
            };
        }

        return {
            totalDrawn: usedCardIds.length,
            remainingCards,
            cardAnalysis,
            exhaustedCards: Object.entries(cardAnalysis)
                .filter(([_, data]) => data.isExhausted)
                .map(([name, _]) => name),
            highRiskCards: Object.entries(cardAnalysis)
                .filter(([_, data]) => data.currentProbability > data.originalProbability * 1.5 && data.type === 'cost')
                .map(([name, data]) => ({ name, probability: data.currentProbability }))
        };
    },

    /**
     * 更新された確率に基づくリスク評価
     */
    getUpdatedRiskProbability: function(cardName) {
        const analysis = this.analyzeDrawnRiskCards();
        const cardData = analysis.cardAnalysis[cardName];

        if (!cardData) return 0;
        return cardData.currentProbability;
    },

    /**
     * リスクカード履歴に基づく戦略推奨
     */
    getRiskBasedRecommendations: function(company) {
        const analysis = this.analyzeDrawnRiskCards();
        const recommendations = [];

        // 不良在庫発生が既に2回出ていれば、在庫制限を緩和できる
        const inventoryRiskCard = analysis.cardAnalysis['不良在庫発生'];
        if (inventoryRiskCard && inventoryRiskCard.isExhausted) {
            recommendations.push({
                type: 'inventory_safe',
                message: '★不良在庫発生は既に2回出た → 在庫20個超えてもOK！',
                priority: 'high'
            });
        }

        // 倉庫火災が既に2回出ていれば、材料を溜め込んでも安全
        const fireCard = analysis.cardAnalysis['倉庫火災'];
        if (fireCard && fireCard.isExhausted) {
            recommendations.push({
                type: 'materials_safe',
                message: '★倉庫火災は既に2回出た → 材料を溜め込んでも安全',
                priority: 'high'
            });
        }

        // 盗難発見が既に2回出ていれば、製品を溜め込んでも安全
        const theftCard = analysis.cardAnalysis['盗難発見'];
        if (theftCard && theftCard.isExhausted) {
            recommendations.push({
                type: 'products_safe',
                message: '★盗難発見は既に2回出た → 製品を溜め込んでも安全',
                priority: 'high'
            });
        }

        // 研究開発成功がまだ残っていれば、研究チップの価値UP
        const researchSuccessCard = analysis.cardAnalysis['研究開発成功'];
        if (researchSuccessCard && researchSuccessCard.remainingCount >= 3) {
            recommendations.push({
                type: 'research_valuable',
                message: `研究開発成功まだ${researchSuccessCard.remainingCount}枚 → 研究チップ投資価値高`,
                priority: 'medium'
            });
        }

        // 研究開発失敗が既に3回出ていれば、研究チップ返却リスクなし
        const researchFailCard = analysis.cardAnalysis['研究開発失敗'];
        if (researchFailCard && researchFailCard.isExhausted) {
            recommendations.push({
                type: 'research_safe',
                message: '★研究開発失敗は既に3回出た → 研究チップ返却リスクなし！',
                priority: 'high'
            });
        }

        // 消費者運動が既に2回出ていれば、製品を安心して持てる
        const consumerCard = analysis.cardAnalysis['消費者運動発生'];
        if (consumerCard && consumerCard.isExhausted) {
            recommendations.push({
                type: 'sales_safe',
                message: '★消費者運動は既に2回出た → 販売停止リスクなし',
                priority: 'medium'
            });
        }

        // 労災発生が既に2回出ていれば、生産を安心して行える
        const accidentCard = analysis.cardAnalysis['労災発生'];
        if (accidentCard && accidentCard.isExhausted) {
            recommendations.push({
                type: 'production_safe',
                message: '★労災発生は既に2回出た → 生産停止リスクなし',
                priority: 'medium'
            });
        }

        // 長期労務紛争が既に2回出ていれば、2回休みリスクなし
        const disputeCard = analysis.cardAnalysis['長期労務紛争'];
        if (disputeCard && disputeCard.isExhausted) {
            recommendations.push({
                type: 'dispute_safe',
                message: '★長期労務紛争は既に2回出た → 2回休みリスクなし！',
                priority: 'high'
            });
        }

        return {
            recommendations,
            summary: this.summarizeRiskStatus(analysis),
            analysis
        };
    },

    /**
     * リスク状況の要約
     */
    summarizeRiskStatus: function(analysis) {
        const exhausted = analysis.exhaustedCards.length;
        const remaining = analysis.remainingCards;

        let riskLevel = 'normal';
        if (exhausted >= 5) {
            riskLevel = 'low'; // 多くのカードが出尽くした
        }

        // 危険なカードがまだ残っているか
        const dangerousRemaining = [];
        const dangerCards = ['不良在庫発生', '倉庫火災', '盗難発見', '長期労務紛争'];
        for (const cardName of dangerCards) {
            const card = analysis.cardAnalysis[cardName];
            if (card && card.remainingCount > 0) {
                dangerousRemaining.push(`${cardName}(残${card.remainingCount}枚)`);
            }
        }

        return {
            drawnCount: analysis.totalDrawn,
            remainingCards: remaining,
            exhaustedCount: exhausted,
            riskLevel,
            dangerousRemaining,
            message: exhausted >= 5 ?
                `${exhausted}種類のカードが出尽くし。リスク低下中` :
                `残り${remaining}枚。注意: ${dangerousRemaining.join(', ')}`
        };
    },

    /**
     * 在庫制限チェック（既出カード考慮版）
     */
    checkInventoryRiskWithHistory: function(company) {
        const basicCheck = this.checkInventoryRisk(company);
        const riskRecommendations = this.getRiskBasedRecommendations(company);

        // 不良在庫発生が出尽くしていれば、制限を緩和
        const inventorySafe = riskRecommendations.recommendations.some(r => r.type === 'inventory_safe');

        if (inventorySafe) {
            return {
                ...basicCheck,
                riskLevel: 'safe',
                recommendation: `在庫${basicCheck.totalInventory}個。不良在庫発生は出尽くしたので20個超えても安全！`,
                canExceedLimit: true
            };
        }

        return {
            ...basicCheck,
            canExceedLimit: false
        };
    },

    /**
     * 期待リスク/リターンを計算（既出カード考慮版）
     */
    calculateExpectedRisk: function(company) {
        let expectedBenefit = 0;
        let expectedCost = 0;
        let variance = 0;

        for (const [cardName, card] of Object.entries(this.RISK_CARD_PROBABILITIES)) {
            let adjustedImpact = card.impact;

            // チップ保有によるボーナス
            if (card.requires === 'education' && (company.chips.education || 0) >= 1) {
                adjustedImpact = Math.max(adjustedImpact, 32 * 3); // 教育チップで3個販売可能
            }
            if (card.requires === 'research' && (company.chips.research || 0) >= 1) {
                const researchBonus = (company.chips.research || 0) * 2;
                adjustedImpact = Math.max(adjustedImpact, 32 * researchBonus);
            }
            if (card.requires === 'advertising' && (company.chips.advertising || 0) >= 1) {
                adjustedImpact = Math.max(adjustedImpact, 32 * (company.chips.advertising || 0) * 2);
            }

            // 保険によるリスク軽減
            if (card.mitigatedBy === 'insurance' && (company.chips.insurance || 0) >= 1) {
                adjustedImpact = adjustedImpact * 0.3; // 保険で70%軽減
            }

            if (card.type === 'benefit') {
                expectedBenefit += card.probability * adjustedImpact;
            } else if (card.type === 'cost') {
                expectedCost += card.probability * Math.abs(adjustedImpact);
            }

            variance += card.probability * adjustedImpact * adjustedImpact;
        }

        return {
            expectedBenefit,
            expectedCost,
            netExpected: expectedBenefit - expectedCost,
            variance,
            stdDev: Math.sqrt(variance),
            riskAdjustedValue: (expectedBenefit - expectedCost) - 0.5 * Math.sqrt(variance)
        };
    },

    /**
     * リスクカードを考慮した行動価値調整
     */
    adjustActionForRisk: function(action, company, baseValue) {
        const riskProfile = this.calculateExpectedRisk(company);

        // 行動タイプ別のリスク調整
        switch (action.type) {
            case 'SELL':
                // 販売前に消費者運動発生のリスク
                return baseValue - riskProfile.expectedCost * 0.1;

            case 'PRODUCE':
            case 'COMPLETE':
                // 製造前に労災発生のリスク
                return baseValue - riskProfile.expectedCost * 0.15;

            case 'BUY_CHIP':
                if (action.chipType === 'research') {
                    // 研究チップは研究開発成功(6/48)で大きなリターン
                    return baseValue + 6/48 * 32 * 3;
                }
                if (action.chipType === 'insurance') {
                    // 保険チップはリスク軽減
                    return baseValue + riskProfile.expectedCost * 0.5;
                }
                return baseValue;

            default:
                return baseValue;
        }
    },

    // ========================================
    // === 究極AI: 5期全体の長期最適化 ===
    // ========================================

    /**
     * 5期終了時の目標自己資本を逆算
     */
    calculateEquityTarget: function(company, targetRank = 1) {
        const period = gameState.currentPeriod;
        const currentEquity = company.equity;

        // 競合の予測自己資本成長
        const competitors = gameState.companies.filter((c, i) => i !== gameState.companies.indexOf(company));
        const avgEquity = competitors.reduce((sum, c) => sum + c.equity, 0) / competitors.length;
        const maxEquity = Math.max(...competitors.map(c => c.equity));

        // 5期終了時の目標（1位狙いは最高+50、2位狙いは平均+30）
        const remainingPeriods = 5 - period + 1;
        const growthPerPeriod = (targetRank === 1) ?
            (maxEquity - currentEquity + 50) / remainingPeriods :
            (avgEquity - currentEquity + 30) / remainingPeriods;

        return {
            currentEquity,
            targetEquity: currentEquity + growthPerPeriod * remainingPeriods,
            requiredGrowthPerPeriod: growthPerPeriod,
            competitorMax: maxEquity,
            competitorAvg: avgEquity,
            isLeader: currentEquity >= maxEquity,
            gap: maxEquity - currentEquity
        };
    },

    /**
     * 期ごとの最適戦略マップ
     */
    PERIOD_STRATEGY_MAP: {
        2: {
            priority: ['research_investment', 'education_investment', 'production_setup'],
            description: '投資重視期',
            targetResearch: 3,
            targetProduction: 5,
            cashReserve: 0.3
        },
        3: {
            priority: ['sales_maximization', 'next_period_chips', 'capacity_expansion'],
            description: 'MQ獲得開始期',
            targetResearch: 4,
            targetProduction: 8,
            cashReserve: 0.25
        },
        4: {
            priority: ['sales_maximization', 'next_period_chips', 'inventory_buildup'],
            description: 'MQ最大化期',
            targetResearch: 5,
            targetProduction: 10,
            cashReserve: 0.2
        },
        5: {
            priority: ['clear_conditions', 'final_sales', 'inventory_adjustment'],
            description: '目標達成期',
            targetInventory: 10,
            targetNextChips: 3,
            cashReserve: 0.15
        }
    },

    /**
     * 長期計画に基づく現在の最適行動
     */
    getLongTermOptimalAction: function(company, companyIndex) {
        const period = gameState.currentPeriod;
        const periodStrategy = this.PERIOD_STRATEGY_MAP[period] || this.PERIOD_STRATEGY_MAP[3];
        const equityTarget = this.calculateEquityTarget(company, 1);

        // 各優先事項に対する行動を生成
        const recommendations = [];

        for (const priority of periodStrategy.priority) {
            switch (priority) {
                case 'research_investment':
                    if ((company.chips.research || 0) < periodStrategy.targetResearch) {
                        const cost = period === 2 ? 20 : 30;
                        if (company.cash > cost + 50) {
                            recommendations.push({
                                action: { type: 'BUY_CHIP', chipType: 'research' },
                                score: 100 - (company.chips.research || 0) * 20,
                                reason: `長期計画: 研究チップ目標${periodStrategy.targetResearch}枚`
                            });
                        }
                    }
                    break;

                case 'education_investment':
                    if ((company.chips.education || 0) < 1) {
                        const cost = period === 2 ? 20 : 30;
                        if (company.cash > cost + 50) {
                            recommendations.push({
                                action: { type: 'BUY_CHIP', chipType: 'education' },
                                score: 80,
                                reason: '長期計画: 教育チップ1枚確保'
                            });
                        }
                    }
                    break;

                case 'sales_maximization':
                    if (company.products > 0 && getSalesCapacity(company) > 0) {
                        const salesQty = Math.min(company.products, getSalesCapacity(company));
                        recommendations.push({
                            action: { type: 'SELL', quantity: salesQty },
                            score: 90,
                            reason: '長期計画: MQ最大化のため販売'
                        });
                    }
                    break;

                case 'next_period_chips':
                    const nextChips = (company.nextPeriodChips?.research || 0) +
                                      (company.nextPeriodChips?.education || 0) +
                                      (company.nextPeriodChips?.advertising || 0);
                    if (nextChips < 3 && company.cash > 60) {
                        recommendations.push({
                            action: { type: 'BUY_NEXT_CHIP', chipType: 'research' },
                            score: 70,
                            reason: `長期計画: 次期チップ(${nextChips}/3)`
                        });
                    }
                    break;

                case 'clear_conditions':
                    const totalInv = company.materials + company.wip + company.products;
                    const nextChipCount = (company.nextPeriodChips?.research || 0) +
                                          (company.nextPeriodChips?.education || 0) +
                                          (company.nextPeriodChips?.advertising || 0);
                    if (totalInv < 10) {
                        recommendations.push({
                            action: { type: 'BUILD_INVENTORY' },
                            score: 100,
                            reason: `5期クリア: 在庫(${totalInv}/10)`
                        });
                    }
                    if (nextChipCount < 3) {
                        recommendations.push({
                            action: { type: 'BUY_NEXT_CHIP', chipType: 'research' },
                            score: 100,
                            reason: `5期クリア: チップ(${nextChipCount}/3)`
                        });
                    }
                    break;
            }
        }

        // 最高スコアの推奨を返す
        recommendations.sort((a, b) => b.score - a.score);
        return recommendations[0] || { action: { type: 'WAIT' }, score: 0, reason: '長期計画: 最適行動なし' };
    },

    // ========================================
    // === 究極AI: 強化学習的戦略進化 ===
    // ========================================

    /**
     * Q値テーブル（状態-行動価値）
     */
    getQValue: function(state, action) {
        const data = this.loadLearningData();
        if (!data.qTable) {
            data.qTable = {};
        }

        const stateKey = this.encodeState(state);
        const actionKey = action.type + '_' + (action.quantity || action.chipType || '');

        return (data.qTable[stateKey] && data.qTable[stateKey][actionKey]) || 0;
    },

    /**
     * Q値の更新（TD学習）
     */
    updateQValue: function(state, action, reward, nextState) {
        const data = this.loadLearningData();
        if (!data.qTable) {
            data.qTable = {};
        }

        const stateKey = this.encodeState(state);
        const actionKey = action.type + '_' + (action.quantity || action.chipType || '');
        const nextStateKey = this.encodeState(nextState);

        // 学習率とディスカウント率
        const alpha = 0.1;
        const gamma = 0.95;

        // 現在のQ値
        const currentQ = this.getQValue(state, action);

        // 次の状態での最大Q値
        let maxNextQ = 0;
        if (data.qTable[nextStateKey]) {
            maxNextQ = Math.max(...Object.values(data.qTable[nextStateKey]));
        }

        // Q値更新（TD学習）
        const newQ = currentQ + alpha * (reward + gamma * maxNextQ - currentQ);

        if (!data.qTable[stateKey]) {
            data.qTable[stateKey] = {};
        }
        data.qTable[stateKey][actionKey] = newQ;

        this.saveLearningData();
    },

    /**
     * 状態をエンコード（Q学習用）
     */
    encodeState: function(state) {
        // 状態の離散化
        const period = state.period || gameState.currentPeriod;
        const cashLevel = Math.floor((state.cash || 0) / 50); // 50円刻み
        const productsLevel = Math.floor((state.products || 0) / 3); // 3個刻み
        const researchChips = state.researchChips || 0;
        const rank = state.rank || 3;

        return `P${period}_C${cashLevel}_PR${productsLevel}_R${researchChips}_RK${rank}`;
    },

    /**
     * ε-greedy方策による行動選択
     */
    selectActionEpsilonGreedy: function(company, companyIndex, epsilon = 0.1) {
        const possibleActions = this.enumeratePossibleActions(company, companyIndex);

        // 状態を構築
        const competitors = this.analyzeCompetitors(company, companyIndex);
        const state = {
            period: gameState.currentPeriod,
            cash: company.cash,
            products: company.products,
            researchChips: company.chips.research || 0,
            rank: competitors.myRank
        };

        // ε確率でランダム探索
        if (Math.random() < epsilon) {
            const randomIndex = Math.floor(Math.random() * possibleActions.length);
            return {
                action: possibleActions[randomIndex],
                isExploration: true,
                qValue: 0
            };
        }

        // 最大Q値の行動を選択
        let bestAction = possibleActions[0];
        let bestQ = -Infinity;

        for (const action of possibleActions) {
            const q = this.getQValue(state, action);
            if (q > bestQ) {
                bestQ = q;
                bestAction = action;
            }
        }

        return {
            action: bestAction,
            isExploration: false,
            qValue: bestQ
        };
    },

    // ========================================
    // === 究極AI: 最適入札タイミング ===
    // ========================================

    /**
     * 入札の最適タイミングを計算
     */
    calculateOptimalBidTiming: function(company, companyIndex) {
        const period = gameState.currentPeriod;
        const rowsRemaining = gameState.maxRows - (company.currentRow || 1);
        const mfgCapacity = getManufacturingCapacity(company);
        const salesCapacity = getSalesCapacity(company);

        // 市場状況の分析
        const markets = gameState.markets || [];
        const totalMarketSpace = markets.reduce((sum, m) => {
            if (!m || m.closed) return sum;
            return sum + ((m.maxStock || 0) - (m.currentStock || 0));
        }, 0);

        // 競合の販売圧力
        const competitors = this.analyzeCompetitors(company, companyIndex);
        const competitorProducts = competitors.rivals.reduce((sum, r) => sum + r.products, 0);

        // 入札タイミングスコア
        let timingScore = 50; // ベーススコア

        // 期末が近いほど入札優先度UP
        if (rowsRemaining <= 3) timingScore += 30;
        else if (rowsRemaining <= 5) timingScore += 15;

        // 市場に空きが少ないほど早く入札
        if (totalMarketSpace <= 5) timingScore += 25;
        else if (totalMarketSpace <= 10) timingScore += 10;

        // 競合の製品が多いほど早く入札（先手を取る）
        if (competitorProducts > 10) timingScore += 20;
        else if (competitorProducts > 5) timingScore += 10;

        // 自社製品が多いほど入札優先
        if (company.products > salesCapacity * 2) timingScore += 15;

        // 研究チップで価格優位なら待てる
        const myResearch = company.chips.research || 0;
        const avgRivalResearch = competitors.averageResearch || 0;
        if (myResearch > avgRivalResearch + 2) timingScore -= 15;

        return {
            score: timingScore,
            shouldBidNow: timingScore >= 70,
            reasoning: this.explainBidTiming(timingScore, rowsRemaining, totalMarketSpace, competitorProducts),
            urgency: timingScore >= 80 ? 'high' : timingScore >= 60 ? 'medium' : 'low'
        };
    },

    explainBidTiming: function(score, rows, marketSpace, competitorProducts) {
        const reasons = [];
        if (rows <= 3) reasons.push('期末接近');
        if (marketSpace <= 5) reasons.push('市場枠少');
        if (competitorProducts > 10) reasons.push('競合製品多');
        if (score >= 80) reasons.push('緊急入札推奨');
        return reasons.join('、') || '通常タイミング';
    },

    /**
     * 究極の統合意思決定（全機能統合）
     */
    makeUltimateDecision: function(company, companyIndex) {
        try {
            const period = gameState.currentPeriod;

            // 安全チェック
            if (!company || !gameState.companies || !gameState.markets) {
                console.warn('[AIBrain] makeUltimateDecision: 必要なデータが未初期化');
                return this.getFallbackDecision(company);
            }

            // === 2期初手：戦略別に多様な行動を選択（究極AIでも尊重） ===
            if (period === 2 && (company.currentRow || 1) <= 2) {
                const strategy = company.strategy || 'balanced';
                const salesCap = getSalesCapacity(company);
                const mfgCap = getManufacturingCapacity(company);
                const safeInvestment = company.cash - 80; // 安全マージン

                console.log(`[2期戦略] ${company.name} (${strategy}): 材料=${company.materials}, 仕掛=${company.wip}, 製品=${company.products}`);

                let strategyAction = null;
                let strategyReason = '';

                switch (strategy) {
                    case 'tech_focused':
                        // 技術重視：チップ購入最優先
                        if ((company.chips.research || 0) < 2 && safeInvestment >= 20) {
                            strategyAction = { type: 'BUY_CHIP', chipType: 'research', cost: 20 };
                            strategyReason = 'tech_focused: 研究チップ優先';
                        } else if ((company.chips.education || 0) < 1 && safeInvestment >= 20) {
                            strategyAction = { type: 'BUY_CHIP', chipType: 'education', cost: 20 };
                            strategyReason = 'tech_focused: 教育チップ';
                        }
                        break;

                    case 'aggressive':
                        // 攻撃的：販売優先（現金回収）
                        if (company.products > 0 && salesCap > 0) {
                            strategyAction = { type: 'SELL', quantity: Math.min(salesCap, company.products) };
                            strategyReason = 'aggressive: 販売で現金回収';
                        } else if ((company.chips.advertising || 0) < 1 && safeInvestment >= 20) {
                            strategyAction = { type: 'BUY_CHIP', chipType: 'advertising', cost: 20 };
                            strategyReason = 'aggressive: 広告チップ';
                        }
                        break;

                    case 'price_focused':
                        // 価格重視：材料仕入れ優先
                        if (safeInvestment >= 30 && (company.materials + company.wip + company.products) < 15) {
                            strategyAction = { type: 'BUY_MATERIALS', quantity: Math.min(mfgCap, 3) };
                            strategyReason = 'price_focused: 材料仕入れ優先';
                        }
                        break;

                    case 'conservative':
                        // 保守的：保険・教育チップ優先
                        if (!company.chips.insurance && safeInvestment >= 20) {
                            strategyAction = { type: 'BUY_CHIP', chipType: 'insurance', cost: 20 };
                            strategyReason = 'conservative: 保険チップ';
                        } else if ((company.chips.education || 0) < 1 && safeInvestment >= 20) {
                            strategyAction = { type: 'BUY_CHIP', chipType: 'education', cost: 20 };
                            strategyReason = 'conservative: 教育チップ';
                        }
                        break;

                    case 'unpredictable':
                        // 予測不能：ランダム
                        const rand = Math.random();
                        if (rand < 0.25 && company.products > 0 && salesCap > 0) {
                            strategyAction = { type: 'SELL', quantity: 1 };
                            strategyReason = 'unpredictable: ランダム販売';
                        } else if (rand < 0.50 && safeInvestment >= 20) {
                            const chips = ['research', 'education', 'advertising'];
                            strategyAction = { type: 'BUY_CHIP', chipType: chips[Math.floor(Math.random() * 3)], cost: 20 };
                            strategyReason = 'unpredictable: ランダムチップ';
                        } else if (rand < 0.75 && safeInvestment >= 20) {
                            strategyAction = { type: 'BUY_MATERIALS', quantity: 2 };
                            strategyReason = 'unpredictable: ランダム材料購入';
                        }
                        break;

                    case 'balanced':
                    default:
                        // バランス型：MQサイクル（販売→生産→仕入れ）
                        if (company.products > 0 && salesCap > 0) {
                            strategyAction = { type: 'SELL', quantity: Math.min(salesCap, company.products) };
                            strategyReason = 'balanced: 販売';
                        }
                        break;
                }

                if (strategyAction) {
                    console.log(`[2期戦略採用] ${company.name}: ${strategyAction.type} - ${strategyReason}`);
                    return {
                        action: strategyAction,
                        score: 100,
                        confidence: 0.90,
                        reasoning: { strategy: strategyReason },
                        components: { base: 100, strategy: strategy }
                    };
                }
            }

            // 1. 基本の統合意思決定
            const baseDecision = this.makeOptimalDecision(company, companyIndex);

        // 2. リスク調整
        const riskProfile = this.calculateExpectedRisk(company);
        const riskAdjustedValue = this.adjustActionForRisk(
            baseDecision.action,
            company,
            baseDecision.score
        );

        // 3. 長期最適化
        const longTermAction = this.getLongTermOptimalAction(company, companyIndex);

        // 4. Q学習による選択
        const rlAction = this.selectActionEpsilonGreedy(company, companyIndex, 0.05);

        // 5. 入札タイミング
        const bidTiming = this.calculateOptimalBidTiming(company, companyIndex);

        // 統合スコア計算
        const scores = {
            base: baseDecision.score,
            riskAdjusted: riskAdjustedValue,
            longTerm: longTermAction.score,
            rl: rlAction.qValue * 10,
            bidUrgency: baseDecision.action.type === 'SELL' ? bidTiming.score : 0
        };

        // 重み付け統合
        const weightedScore =
            scores.base * 0.30 +
            scores.riskAdjusted * 0.20 +
            scores.longTerm * 0.25 +
            scores.rl * 0.15 +
            scores.bidUrgency * 0.10;

        // 最終アクション決定（最高スコアの行動を採用）
        let finalAction = baseDecision.action;
        let finalReason = baseDecision.reasoning;

        if (longTermAction.score > baseDecision.score * 1.2) {
            finalAction = longTermAction.action;
            finalReason = longTermAction.reason;
        }

        // 入札緊急時は販売を優先
        if (bidTiming.shouldBidNow && company.products > 0 && getSalesCapacity(company) > 0) {
            if (bidTiming.urgency === 'high') {
                finalAction = { type: 'SELL', quantity: Math.min(company.products, getSalesCapacity(company)) };
                finalReason = `入札緊急: ${bidTiming.reasoning}`;
            }
        }

        return {
            action: finalAction,
            score: weightedScore,
            confidence: Math.min(0.98, baseDecision.confidence + 0.05),
            reasoning: {
                ...baseDecision.reasoning,
                riskAdjustment: riskProfile.netExpected.toFixed(0),
                longTermPlan: longTermAction.reason,
                rlQValue: rlAction.qValue.toFixed(2),
                bidTiming: bidTiming.reasoning
            },
            components: scores
        };
        } catch (error) {
            console.error('[AIBrain] makeUltimateDecision エラー:', error);
            return this.getFallbackDecision(company);
        }
    },

    /**
     * エラー時のフォールバック意思決定
     */
    getFallbackDecision: function(company) {
        // 最もシンプルで安全な行動を返す（フル能力で実行）
        let action = { type: 'WAIT' };
        let reason = 'フォールバック: ';

        if (company) {
            const salesCap = typeof getSalesCapacity === 'function' ? getSalesCapacity(company) : 2;
            const mfgCap = typeof getManufacturingCapacity === 'function' ? getManufacturingCapacity(company) : 1;

            if (company.products > 0 && salesCap > 0) {
                const sellQty = Math.min(company.products, salesCap);
                action = { type: 'SELL', quantity: sellQty };
                reason += `製品${sellQty}個販売`;
            } else if (company.wip > 0 && mfgCap > 0) {
                const completeQty = Math.min(company.wip, mfgCap);
                action = { type: 'COMPLETE', quantity: completeQty };
                reason += `${completeQty}個完成`;
            } else if (company.materials > 0 && mfgCap > 0) {
                const produceQty = Math.min(company.materials, mfgCap);
                action = { type: 'PRODUCE', quantity: produceQty };
                reason += `${produceQty}個投入`;
            } else if (company.cash >= 20) {
                action = { type: 'BUY_MATERIALS' };
                reason += '材料購入';
            } else {
                reason += '待機';
            }
        } else {
            reason += 'company未定義';
        }

        return {
            action: action,
            score: 0,
            confidence: 0.5,
            reasoning: { fallback: reason },
            components: { base: 0, riskAdjusted: 0, longTerm: 0, rl: 0, bidUrgency: 0 }
        };
    },

    // ============================================
    // 🎭 人間らしい行動パターン
    // ============================================

    /**
     * 人間らしい「揺れ」を加える
     * - 最適解でも100%選ばない
     * - 性格による選好の違い
     * - 時々「気まぐれ」な選択
     */
    addHumanLikeBehavior: function(action, company, alternatives) {
        const strategy = company.strategy || 'balanced';
        const randomFactor = Math.random();

        // 性格別の「ブレ」確率
        const deviationChance = {
            aggressive: 0.05,    // 5%で違う選択
            conservative: 0.08,  // 8%で違う選択（慎重に考え直す）
            balanced: 0.03,      // 3%で違う選択
            tech_focused: 0.04,  // 4%で違う選択
            price_focused: 0.06, // 6%で違う選択
            unpredictable: 0.25  // 25%で違う選択（読めない）
        };

        const chance = deviationChance[strategy] || 0.05;

        // ブレが発生
        if (randomFactor < chance && alternatives && alternatives.length > 0) {
            const alternative = alternatives[Math.floor(Math.random() * alternatives.length)];
            console.log(`[人間らしさ] ${company.name}: 気が変わった... ${action.type} → ${alternative.actionType}`);
            return {
                ...action,
                type: alternative.actionType,
                humanVariation: true
            };
        }

        return action;
    },

    /**
     * 思考時間を戦略別に計算（表示用）
     */
    getThinkingDuration: function(company, decision) {
        const strategy = company.strategy || 'balanced';
        const confidence = decision.confidence || 0.5;

        // 基本思考時間（ms）
        const baseTime = {
            aggressive: 800,     // 速い決断
            conservative: 1500,  // じっくり考える
            balanced: 1000,      // 平均的
            tech_focused: 1200,  // やや慎重
            price_focused: 900,  // 早め
            unpredictable: 600   // 直感的
        };

        const base = baseTime[strategy] || 1000;

        // 信頼度が低いと長く考える
        const confidenceMultiplier = 1 + (1 - confidence) * 0.5;

        // ランダム要素
        const randomVariation = 0.8 + Math.random() * 0.4;

        return Math.floor(base * confidenceMultiplier * randomVariation);
    },

    /**
     * 性格に応じた「癖」を反映した行動選択
     */
    applyPersonalityQuirks: function(action, company, context) {
        const strategy = company.strategy || 'balanced';

        switch (strategy) {
            case 'aggressive':
                // 攻撃的：販売を積極的に、価格を強気に
                if (action.type === 'SELL' && action.priceMultiplier) {
                    action.priceMultiplier = Math.min(0.95, action.priceMultiplier + 0.05);
                }
                break;

            case 'conservative':
                // 堅実：現金を多めに保持したがる
                if (action.type === 'BUY_MATERIALS' && company.cash < 80) {
                    action.reduced = true;
                    action.reason += '（慎重に少量）';
                }
                break;

            case 'price_focused':
                // 価格重視：入札で粘る
                if (action.type === 'SELL') {
                    action.bidAggressive = true;
                }
                break;

            case 'tech_focused':
                // 技術重視：チップ購入を好む
                if (action.type === 'WAIT' && company.cash >= 40 && company.chips.research < 5) {
                    return {
                        type: 'BUY_CHIP',
                        chipType: 'research',
                        reason: '技術重視の癖: 研究投資',
                        quirk: true
                    };
                }
                break;

            case 'unpredictable':
                // 予測不能：時々真逆のことをする
                if (Math.random() < 0.1) {
                    const opposites = {
                        'SELL': 'BUY_MATERIALS',
                        'BUY_MATERIALS': 'SELL',
                        'PRODUCE': 'BUY_CHIP',
                        'BUY_CHIP': 'PRODUCE'
                    };
                    if (opposites[action.type]) {
                        console.log(`[予測不能] ${company.name}: 急に方向転換！`);
                        return {
                            ...action,
                            type: opposites[action.type],
                            quirk: true
                        };
                    }
                }
                break;
        }

        return action;
    },

    // ============================================
    // 🏆 自己資本450目標戦略エンジン
    // ============================================

    /**
     * 期別の目標自己資本を取得
     * 初期300円 → 5期末450円以上を目指す
     */
    getEquityTarget: function(period) {
        const targets = {
            2: 310,   // 2期末: 微増（基盤構築期）
            3: 350,   // 3期末: +40（成長開始）
            4: 400,   // 4期末: +50（成長加速）
            5: 450    // 5期末: +50（目標達成）
        };
        return targets[period] || 300;
    },

    /**
     * 目標達成に必要なGを計算
     */
    getRequiredG: function(company, period) {
        const currentEquity = company.equity;
        const targetEquity = this.getEquityTarget(period);
        const gap = targetEquity - currentEquity;

        // 税金を考慮（G × 0.6 が純増）
        const requiredG = Math.ceil(gap / 0.6);

        return {
            currentEquity,
            targetEquity,
            gap,
            requiredG,
            isOnTrack: currentEquity >= targetEquity * 0.9,
            needsAggression: gap > 50
        };
    },

    /**
     * 行動シミュレーション：各行動の期待Gを計算
     */
    simulateAction: function(company, actionType, companyIndex) {
        const period = gameState.currentPeriod;
        const rowsRemaining = gameState.maxRows - (company.currentRow || 1);
        const mfgCapacity = getManufacturingCapacity(company);
        const salesCapacity = getSalesCapacity(company);

        let expectedGImpact = 0;
        let cashImpact = 0;
        let cyclesGained = 0;
        let confidence = 0.5;

        switch (actionType) {
            case 'SELL':
                const sellQty = Math.min(company.products, salesCapacity);
                const avgPrice = 28 + (company.chips.research || 0) * 2;
                const avgVQ = 15; // 材料12 + 製造2 + 在庫評価1
                expectedGImpact = sellQty * (avgPrice - avgVQ);
                cashImpact = sellQty * avgPrice;
                confidence = 0.9;
                break;

            case 'PRODUCE':
                const produceQty = Math.min(company.materials + company.wip, mfgCapacity);
                // 生産は直接Gに影響しないが、販売可能在庫を増やす
                expectedGImpact = 0;
                cashImpact = -produceQty; // 製造費
                cyclesGained = 1; // 1サイクル進む
                confidence = 0.8;
                break;

            case 'BUY_MATERIALS':
                const buyQty = mfgCapacity;
                const materialCost = 12 * buyQty;
                expectedGImpact = 0; // 直接影響なし
                cashImpact = -materialCost;
                cyclesGained = 1;
                confidence = 0.7;
                break;

            case 'BUY_CHIP':
                const chipCost = period === 2 ? 20 : 40;
                // チップの長期価値
                expectedGImpact = Math.floor(rowsRemaining / 4) * 3; // 平均効果
                cashImpact = -chipCost;
                confidence = 0.6;
                break;

            case 'WAIT':
                expectedGImpact = -5; // 機会損失
                confidence = 0.3;
                break;
        }

        // MQサイクル完了までの推定Gを加算
        const futureCycles = Math.floor(rowsRemaining / 4);
        const avgMQPerCycle = Math.min(mfgCapacity, salesCapacity) * 13;
        const futureG = futureCycles * avgMQPerCycle;

        return {
            actionType,
            expectedGImpact,
            cashImpact,
            cyclesGained,
            futureG,
            totalValue: expectedGImpact + futureG * 0.3, // 将来価値に割引
            confidence
        };
    },

    /**
     * 全行動を比較して最適行動を選択
     */
    findOptimalAction: function(company, companyIndex) {
        const possibleActions = ['SELL', 'PRODUCE', 'BUY_MATERIALS', 'BUY_CHIP', 'WAIT'];
        const simulations = [];

        for (const action of possibleActions) {
            // 実行可能性チェック
            if (action === 'SELL' && company.products <= 0) continue;
            if (action === 'PRODUCE' && company.materials <= 0 && company.wip <= 0) continue;
            if (action === 'BUY_MATERIALS' && company.cash < 10) continue;
            if (action === 'BUY_CHIP' && company.cash < 20) continue;

            const sim = this.simulateAction(company, action, companyIndex);
            simulations.push(sim);
        }

        // スコアでソート
        simulations.sort((a, b) => b.totalValue - a.totalValue);

        const best = simulations[0] || { actionType: 'WAIT', totalValue: 0, confidence: 0.3 };

        console.log(`[G最大化シミュ] ${company.name}: ${simulations.map(s => `${s.actionType}=${s.totalValue.toFixed(0)}`).join(', ')}`);

        return {
            action: best.actionType,
            score: best.totalValue,
            confidence: best.confidence,
            alternatives: simulations.slice(1, 3)
        };
    },

    /**
     * 自己資本450達成のための戦略的行動決定
     */
    getEquityMaximizingAction: function(company, companyIndex) {
        const period = gameState.currentPeriod;
        const rowsRemaining = gameState.maxRows - (company.currentRow || 1);
        const equityStatus = this.getRequiredG(company, period);

        console.log(`[自己資本戦略] ${company.name}: 現在¥${equityStatus.currentEquity} → 目標¥${equityStatus.targetEquity} (必要G=¥${equityStatus.requiredG})`);

        // 危機モード：目標から大幅に遅れている
        if (equityStatus.needsAggression) {
            console.log(`[危機モード] ${company.name}: 攻めの姿勢で挽回`);

            // 製品があれば積極販売
            if (company.products > 0) {
                return {
                    action: { type: 'SELL', quantity: Math.min(company.products, getSalesCapacity(company)) },
                    reason: '自己資本挽回のため積極販売',
                    confidence: 0.9
                };
            }

            // 仕掛/材料があれば急いで生産
            if (company.wip > 0 || company.materials > 0) {
                return {
                    action: { type: 'PRODUCE', quantity: getManufacturingCapacity(company) },
                    reason: '自己資本挽回のため生産加速',
                    confidence: 0.85
                };
            }
        }

        // 順調モード：最適化シミュレーションに従う
        const optimal = this.findOptimalAction(company, companyIndex);

        return {
            action: { type: optimal.action },
            reason: `G最大化シミュ: ${optimal.action} (スコア${optimal.score.toFixed(0)})`,
            confidence: optimal.confidence
        };
    }
};

// グローバルスコープにエクスポート
if (typeof window !== 'undefined') {
    window.AIBrain = AIBrain;
}
