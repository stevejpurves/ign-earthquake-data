import typer
import pandas as pd
from pathlib import Path
from datetime import date

from igndata import build, update as update_data

app = typer.Typer()


@app.command()
def rebuild():
  start = date(2021,8,31)
  typer.echo(f"rebuilding all data since {start}")
  build(Path('.'), start)

@app.command()
def update(
  days: int = typer.Argument(help="Number of days of data to collect", default=1)
  ):
  typer.echo(f"update with latest {days} days data")
  update_data(Path('./data.csv'), days)

if __name__ == "__main__":
  app()
