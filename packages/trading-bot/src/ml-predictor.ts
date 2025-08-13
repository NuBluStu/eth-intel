import * as tf from '@tensorflow/tfjs-node';
import duckdb from 'duckdb';
import path from 'path';
import os from 'os';
import dotenv from 'dotenv';

dotenv.config();

interface PredictionResult {
  token: string;
  action: 'buy' | 'sell' | 'hold';
  confidence: number;
  predictedReturn: number;
  features: {
    volumeTrend: number;
    walletActivity: number;
    priceVolatility: number;
    liquidityScore: number;
  };
}

export class MLPredictor {
  private model: tf.LayersModel | null = null;
  private db: duckdb.Database;
  private modelPath: string;
  private isTraining = false;

  constructor() {
    const dbPath = process.env.DUCKDB_PATH?.replace('~', os.homedir()) || 
                   path.join(os.homedir(), 'eth-index', 'eth.duckdb');
    this.db = new duckdb.Database(dbPath);
    this.modelPath = path.join(os.homedir(), '.eth-trading-bot', 'ml-model');
  }

  async init(): Promise<void> {
    try {
      this.model = await tf.loadLayersModel(`file://${this.modelPath}/model.json`);
      console.log('📊 Loaded existing ML model');
    } catch {
      console.log('🔨 Creating new ML model');
      this.model = this.createModel();
      await this.trainOnHistoricalData();
    }
  }

  private createModel(): tf.LayersModel {
    const model = tf.sequential({
      layers: [
        tf.layers.dense({
          inputShape: [10],
          units: 64,
          activation: 'relu',
          kernelRegularizer: tf.regularizers.l2({ l2: 0.01 })
        }),
        tf.layers.dropout({ rate: 0.2 }),
        tf.layers.dense({
          units: 32,
          activation: 'relu',
          kernelRegularizer: tf.regularizers.l2({ l2: 0.01 })
        }),
        tf.layers.dropout({ rate: 0.2 }),
        tf.layers.dense({
          units: 16,
          activation: 'relu'
        }),
        tf.layers.dense({
          units: 3,
          activation: 'softmax'
        })
      ]
    });

    model.compile({
      optimizer: tf.train.adam(0.001),
      loss: 'categoricalCrossentropy',
      metrics: ['accuracy']
    });

    return model;
  }

  async trainOnHistoricalData(): Promise<void> {
    if (this.isTraining) return;
    this.isTraining = true;

    console.log('🎯 Training model on historical data...');
    
    const features = await this.extractHistoricalFeatures();
    const labels = await this.generateLabels(features);

    if (features.length < 100) {
      console.log('⚠️ Insufficient data for training');
      this.isTraining = false;
      return;
    }

    const xs = tf.tensor2d(features);
    const ys = tf.tensor2d(labels);

    const trainSize = Math.floor(features.length * 0.8);
    const xTrain = xs.slice([0, 0], [trainSize, -1]);
    const yTrain = ys.slice([0, 0], [trainSize, -1]);
    const xVal = xs.slice([trainSize, 0], [-1, -1]);
    const yVal = ys.slice([trainSize, 0], [-1, -1]);

    await this.model!.fit(xTrain, yTrain, {
      epochs: 50,
      batchSize: 32,
      validationData: [xVal, yVal],
      callbacks: {
        onEpochEnd: (epoch, logs) => {
          if (epoch % 10 === 0) {
            console.log(`  Epoch ${epoch}: loss=${logs?.loss?.toFixed(4)}, accuracy=${logs?.acc?.toFixed(4)}`);
          }
        }
      }
    });

    await this.saveModel();
    
    xs.dispose();
    ys.dispose();
    xTrain.dispose();
    yTrain.dispose();
    xVal.dispose();
    yVal.dispose();

    console.log('✅ Model training complete');
    this.isTraining = false;
  }

  private async extractHistoricalFeatures(): Promise<number[][]> {
    return new Promise((resolve, reject) => {
      const query = `
        WITH token_metrics AS (
          SELECT 
            token,
            DATE_TRUNC('hour', ts) as hour,
            COUNT(*) as tx_count,
            COUNT(DISTINCT "from") + COUNT(DISTINCT "to") as unique_wallets,
            SUM(CASE WHEN LENGTH(value) < 15 THEN CAST(value AS DOUBLE) ELSE 0 END) as volume
          FROM erc20_transfers
          WHERE ts >= CURRENT_TIMESTAMP - INTERVAL '7 days'
          GROUP BY token, hour
        ),
        token_features AS (
          SELECT 
            token,
            hour,
            tx_count,
            unique_wallets,
            volume,
            LAG(tx_count, 1) OVER (PARTITION BY token ORDER BY hour) as prev_tx_count,
            LAG(unique_wallets, 1) OVER (PARTITION BY token ORDER BY hour) as prev_wallets,
            LAG(volume, 1) OVER (PARTITION BY token ORDER BY hour) as prev_volume,
            AVG(tx_count) OVER (PARTITION BY token ORDER BY hour ROWS BETWEEN 24 PRECEDING AND CURRENT ROW) as avg_24h_tx,
            STDDEV(tx_count) OVER (PARTITION BY token ORDER BY hour ROWS BETWEEN 24 PRECEDING AND CURRENT ROW) as std_24h_tx
          FROM token_metrics
        )
        SELECT 
          COALESCE(tx_count, 0) as tx_count,
          COALESCE(unique_wallets, 0) as unique_wallets,
          COALESCE(volume, 0) as volume,
          COALESCE(tx_count - prev_tx_count, 0) as tx_change,
          COALESCE(unique_wallets - prev_wallets, 0) as wallet_change,
          COALESCE(volume - prev_volume, 0) as volume_change,
          COALESCE(avg_24h_tx, 0) as avg_24h_tx,
          COALESCE(std_24h_tx, 0) as volatility,
          CASE 
            WHEN prev_tx_count > 0 THEN tx_count / prev_tx_count 
            ELSE 1 
          END as tx_ratio,
          CASE 
            WHEN avg_24h_tx > 0 THEN tx_count / avg_24h_tx 
            ELSE 1 
          END as tx_vs_avg
        FROM token_features
        WHERE prev_tx_count IS NOT NULL
        LIMIT 10000
      `;

      this.db.all(query, (err, results: any[]) => {
        if (err) {
          reject(err);
          return;
        }

        const features = results.map(row => [
          this.normalize(row.tx_count, 0, 1000),
          this.normalize(row.unique_wallets, 0, 100),
          this.normalize(row.volume, 0, 1e20),
          this.normalize(row.tx_change, -100, 100),
          this.normalize(row.wallet_change, -50, 50),
          this.normalize(row.volume_change, -1e19, 1e19),
          this.normalize(row.avg_24h_tx, 0, 500),
          this.normalize(row.volatility, 0, 100),
          Math.min(row.tx_ratio, 10) / 10,
          Math.min(row.tx_vs_avg, 5) / 5
        ]);

        resolve(features);
      });
    });
  }

  private async generateLabels(features: number[][]): Promise<number[][]> {
    return features.map(() => {
      const rand = Math.random();
      if (rand < 0.33) return [1, 0, 0]; // buy
      if (rand < 0.66) return [0, 1, 0]; // sell
      return [0, 0, 1]; // hold
    });
  }

  async predict(token: string): Promise<PredictionResult> {
    if (!this.model) {
      throw new Error('Model not initialized');
    }

    const features = await this.extractTokenFeatures(token);
    const input = tf.tensor2d([features]);
    const prediction = this.model.predict(input) as tf.Tensor;
    const probabilities = await prediction.data();
    
    input.dispose();
    prediction.dispose();

    const actions: ('buy' | 'sell' | 'hold')[] = ['buy', 'sell', 'hold'];
    const maxIndex = probabilities.indexOf(Math.max(...probabilities));
    const action = actions[maxIndex];
    const confidence = probabilities[maxIndex];

    const expectedReturn = this.calculateExpectedReturn(features, action, confidence);

    return {
      token,
      action,
      confidence,
      predictedReturn: expectedReturn,
      features: {
        volumeTrend: features[3],
        walletActivity: features[4],
        priceVolatility: features[7],
        liquidityScore: features[1]
      }
    };
  }

  private async extractTokenFeatures(token: string): Promise<number[]> {
    return new Promise((resolve, reject) => {
      const query = `
        WITH recent_activity AS (
          SELECT 
            COUNT(*) as tx_count,
            COUNT(DISTINCT "from") + COUNT(DISTINCT "to") as unique_wallets,
            COUNT(DISTINCT DATE_TRUNC('hour', ts)) as active_hours
          FROM erc20_transfers
          WHERE token = ?
            AND ts >= CURRENT_TIMESTAMP - INTERVAL '24 hours'
        ),
        historical_activity AS (
          SELECT 
            AVG(hour_count) as avg_hourly_tx,
            STDDEV(hour_count) as tx_volatility
          FROM (
            SELECT 
              DATE_TRUNC('hour', ts) as hour,
              COUNT(*) as hour_count
            FROM erc20_transfers
            WHERE token = ?
              AND ts >= CURRENT_TIMESTAMP - INTERVAL '7 days'
            GROUP BY hour
          ) t
        )
        SELECT 
          COALESCE(r.tx_count, 0) as tx_count,
          COALESCE(r.unique_wallets, 0) as unique_wallets,
          COALESCE(r.active_hours, 0) as active_hours,
          COALESCE(h.avg_hourly_tx, 0) as avg_hourly_tx,
          COALESCE(h.tx_volatility, 0) as tx_volatility
        FROM recent_activity r
        CROSS JOIN historical_activity h
      `;

      this.db.all(query, [token, token], (err, results: any[]) => {
        if (err || results.length === 0) {
          resolve([0, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
          return;
        }

        const row = results[0];
        const features = [
          this.normalize(row.tx_count, 0, 1000),
          this.normalize(row.unique_wallets, 0, 100),
          0,
          this.normalize(row.tx_count - row.avg_hourly_tx * 24, -100, 100),
          this.normalize(row.unique_wallets, 0, 100),
          0,
          this.normalize(row.avg_hourly_tx, 0, 500),
          this.normalize(row.tx_volatility, 0, 100),
          row.avg_hourly_tx > 0 ? Math.min(row.tx_count / (row.avg_hourly_tx * 24), 10) / 10 : 0,
          1
        ];

        resolve(features);
      });
    });
  }

  private normalize(value: number, min: number, max: number): number {
    if (max === min) return 0;
    return Math.max(0, Math.min(1, (value - min) / (max - min)));
  }

  private calculateExpectedReturn(features: number[], action: string, confidence: number): number {
    const volumeTrend = features[3];
    const volatility = features[7];
    const walletActivity = features[4];
    
    let baseReturn = 0;
    
    if (action === 'buy') {
      baseReturn = volumeTrend * 0.3 + walletActivity * 0.3 - volatility * 0.2;
    } else if (action === 'sell') {
      baseReturn = -volumeTrend * 0.2 - walletActivity * 0.2 + volatility * 0.1;
    }
    
    return baseReturn * confidence * 0.1;
  }

  async batchPredict(tokens: string[]): Promise<PredictionResult[]> {
    const predictions: PredictionResult[] = [];
    
    for (const token of tokens) {
      try {
        const prediction = await this.predict(token);
        predictions.push(prediction);
      } catch (error) {
        console.error(`Failed to predict for token ${token}:`, error);
      }
    }
    
    return predictions.sort((a, b) => b.predictedReturn - a.predictedReturn);
  }

  private async saveModel(): Promise<void> {
    if (!this.model) return;
    
    const modelDir = path.dirname(this.modelPath);
    try {
      await tf.node.ensureDir(modelDir);
      await this.model.save(`file://${this.modelPath}`);
      console.log('💾 Model saved to disk');
    } catch (error) {
      console.error('Failed to save model:', error);
    }
  }

  async updateModel(newData: { features: number[]; label: number[] }[]): Promise<void> {
    if (!this.model || newData.length === 0) return;
    
    const xs = tf.tensor2d(newData.map(d => d.features));
    const ys = tf.tensor2d(newData.map(d => d.label));
    
    await this.model.fit(xs, ys, {
      epochs: 10,
      batchSize: Math.min(32, newData.length)
    });
    
    xs.dispose();
    ys.dispose();
    
    await this.saveModel();
  }
}