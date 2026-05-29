export interface Stock {
  id: string;
  ticker: string;
  buyPrice: number;
  targetPrice?: number;
  shares?: number;
  deadline: string;
  color: string;
}

export interface StockWithPrice extends Stock {
  currentPrice: number | null;
  progress: number | null;
}

export interface ShortStock {
  id: string;
  ticker: string;
  yahooSymbol: string;
  buyPrice: number;
  buyDate: string;
  currency: string;
  color: string;
  shares?: number;
}

export interface DarkHorseConfig {
  pctPerWeek: number;
  startDate: string;
  label: string;
}
