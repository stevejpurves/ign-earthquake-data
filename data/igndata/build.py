from .fetch import fetch_data
from pathlib import Path
from datetime import date, datetime

def build(datapath: Path, start_date: date = date(2021,8,31)):
  delta = date.today() - start_date
  df = fetch_data(delta.days)
  df.to_json(datapath / 'data.json')
  df.to_csv(datapath / 'data.csv', index=False)
  return df