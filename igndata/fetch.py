import requests
import pandas as pd

URL = 'https://www.ign.es/web/en/ign/portal/ultimos-terremotos/-/ultimos-terremotos/get10dias?_IGNGFSSismoSismicidadReciente_WAR_IGNGFSSismoSismicidadRecienteportlet_formDate=1635524945194&_IGNGFSSismoSismicidadReciente_WAR_IGNGFSSismoSismicidadRecienteportlet_dias={}';

def fetch_page(url: str):
  r = requests.get(url)
  dfs = pd.read_html(r.text)
  df = dfs[0]
  df['Date'] = pd.to_datetime(df.Date, dayfirst=True)
  return df

def fetch_data(days: int):
  return fetch_page(URL.format(days))
