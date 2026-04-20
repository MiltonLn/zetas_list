export interface Player {
  id: string;
  position: number;
  name: string;
  attended: boolean;
  paid: boolean;
  note: string;
  fromWaitList?: boolean;
}

export interface GameList {
  id: string;
  title: string;
  rawMessage: string;
  createdAt: string;
  mainList: Player[];
  waitList: Player[];
}

export type ParseErrorType = 'no_title' | 'no_players' | 'invalid_format';
export type ParseWarningType = 'skipped_line' | 'gap_in_numbers' | 'duplicate_number' | 'empty_name';

export interface ParseError {
  type: ParseErrorType;
  message: string;
}

export interface ParseWarning {
  type: ParseWarningType;
  line: number;
  raw: string;
  message: string;
}

export interface ParseResult {
  success: boolean;
  data?: {
    title: string;
    mainList: Player[];
    waitList: Player[];
  };
  errors: ParseError[];
  warnings: ParseWarning[];
}
