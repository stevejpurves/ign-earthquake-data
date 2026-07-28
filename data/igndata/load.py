import pandas as pd
from pathlib import Path

def load(filepath: Path, sep: str = ','):
  df = pd.read_csv(filepath, sep)
  df['Date'] = pd.to_datetime(df.Date, dayfirst=True)
  df = df.sort_values(by=['Date', 'UTC time'], ascending=[False,False])
  return df