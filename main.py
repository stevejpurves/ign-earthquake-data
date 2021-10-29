import typer
import requests
import pandas as pd

app = typer.Typer()
URL = 'https://www.ign.es/web/en/ign/portal/ultimos-terremotos/-/ultimos-terremotos/get10dias?_IGNGFSSismoSismicidadReciente_WAR_IGNGFSSismoSismicidadRecienteportlet_formDate=1635524945194&_IGNGFSSismoSismicidadReciente_WAR_IGNGFSSismoSismicidadRecienteportlet_dias={}';

def fetch_page(url: str):
  r = requests.get(url)
  df = pd.read_html(r.text)
  return df[0]

@app.command()
def build(days: int = 60):
  typer.echo(f"(re)building all data")
  df = fetch_page(URL.format(days))
  df.to_json('data.json')
  df.to_csv('data.csv', index=False)

@app.command()
def update(days: int = 1):
  typer.echo(f"update with latest (1) days data")
  df = fetch_page(URL.format(days))
  last_df = pd.read_json('data.json')
  all_df = pd.concat([df, last_df]).drop_duplicates(subset='Event').sort_values(by=['Date', 'UTC Time'])
  all_df.to_json('data.json')
  all_df.to_csv('data.csv', index=False)


if __name__ == "__main__":
  app()
