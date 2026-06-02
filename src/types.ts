export interface Stock {
  id: string;
  ticker: string;
  buyPrice: number;
  targetPrice?: number;
  shares?: number;
  deadline: string;
  color: string;
  inPlay?: boolean;
  soldPrice?: number;
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
  inPlay?: boolean;
  soldPrice?: number;
}

export interface DarkHorseConfig {
  pctPerWeek: number;
  startDate: string;
  label: string;
}

export interface Race {
  id: string;
  name: string;
  emoji: string;
  description: string;
  status: 'active' | 'closed';
  interval: 'intra-day' | 'week' | 'quarter';
  start_date: string;
  end_date: string | null;
  created_by: string | null;
  created_at: string;
  locked: boolean;
  repeating: boolean;
  position_count?: number;
}
