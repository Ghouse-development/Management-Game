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
                priority: company.chips.education < (period === 2 ? 2 : 1) ? 'highest' : 'medium'
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

        // 2期の投資優先順位
        if (period === 2) {
            // 教育チップ2枚（繰越のため）
            if (company.chips.education < 2 && investmentBudget >= 40) {
                investments.push({ type: 'education', qty: 2 - company.chips.education, cost: (2 - company.chips.education) * 20, priority: 1 });
            }
            // 研究チップ（4枚目標 = 繰越3枚）
            const maxResearchInPeriod2 = 4;
            if (company.chips.research < maxResearchInPeriod2 && investmentBudget >= 20) {
                const researchQty = Math.min(maxResearchInPeriod2 - company.chips.research, Math.floor(investmentBudget / 20));
                investments.push({ type: 'research', qty: researchQty, cost: researchQty * 20, priority: 2 });
            }
            // セールスマン採用（販売能力強化）
            if (salesCapacity < mfgCapacity && company.salesmen < 3 && investmentBudget >= 5) {
                investments.push({ type: 'salesman', qty: 1, cost: 5, priority: 3 });
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
     * 最適な投資戦略を決定（G最大化の観点）
     */
    getOptimalInvestmentStrategy: function(company, companyIndex) {
        const investments = ['research', 'education', 'advertising', 'worker', 'salesman'];
        const results = investments.map(type =>
            this.calculateGImpactROI(company, type, companyIndex)
        );

        // ROIでソート
        results.sort((a, b) => b.roi - a.roi);

        const affordable = results.filter(r => company.cash > r.cost + 50);
        const worthwhile = affordable.filter(r => r.isWorthIt);

        return {
            allOptions: results,
            best: worthwhile[0] || null,
            affordable,
            recommendation: worthwhile.length > 0 ?
                `${worthwhile[0].type}投資推奨（ROI:${worthwhile[0].roi}%）` :
                '投資より販売サイクル優先'
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
        const marketCapacity = market.maxStock - market.currentStock;
        if (marketCapacity <= 0) {
            return { shouldSell: false, reason: '市場枠なし' };
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
    }
};

// グローバルスコープにエクスポート
if (typeof window !== 'undefined') {
    window.AIBrain = AIBrain;
}
