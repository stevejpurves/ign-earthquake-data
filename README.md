# Instituto Geogràphica Nacional (IGN) - Earthquake Data 🌏

This repo contains data from the IGN website here:

https://www.ign.es/web/en/ign/portal/ultimos-terremotos/-/ultimos-terremotos/

Along with a script to pull or update the data with the latest day(s) entries.

An example project with a draft paper, notebooks, figures and interactive plots is [on Curvenote here](https://curvenote.com/@stevejpurves/la-palma-earthquakes).

## Purpose

This dataset has been collected here to make it easier to access data relating to the (ongoing) seismic and volcanic crisis on La Palma, Islas Canarias. 🌋

The dataset contains all earthquake data on the IGN feed, so data points may be from anywhere in Spanish territory. Filter appropriately for data on La Palma.

## Contents

[data.json](data.json), [data.csv](data.csv) - data files up to date as of the last commit

`main.py` - command line script to scrape and update the local data. To run this:

```
python -m venv env
source env/bin/activate
python main.py --help
```

## License

Code is released under an MIT license. Data is taken from the IGN website under Spanish `Re-use of Public Sector Information (RISP)` rules which allow distribution under the same conditions.

See more in [LICENSE.md](LICENSE.md)
