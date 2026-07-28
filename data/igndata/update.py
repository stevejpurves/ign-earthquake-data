from .fetch import fetch_data
from .load import load
import pandas as pd
from pathlib import Path

def update(filepath: Path, days: int):
  last_df = load(filepath)
  df = fetch_data(days)
  all_df = df.append(last_df, ignore_index=True).drop_duplicates(subset='Event').sort_values(by=['Date', 'UTC time'], ascending=False)
  all_df.to_json('data.json')
  all_df.to_csv('data.csv', index=False)
  return all_df