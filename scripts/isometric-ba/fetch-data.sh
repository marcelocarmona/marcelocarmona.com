#!/usr/bin/env bash
# Downloads the raw inputs for the isometric Buenos Aires map into .cache/isometric-ba.
# Requires curl and osmium-tool (brew install osmium-tool). Downloads resume with -C -.
set -euo pipefail

cd "$(dirname "$0")/../.."
mkdir -p .cache/isometric-ba
cd .cache/isometric-ba

get() { curl -fsSL -A Mozilla/5.0 -C - --retry 5 -o "$1" "$2"; }

BA_DATA=https://cdn.buenosaires.gob.ar/datosabiertos/datasets

echo '> tejido urbano (~1GB)'
get tejido.geojson "$BA_DATA/secretaria-de-desarrollo-urbano/tejido-urbano/tejido.geojson"

echo '> street trees'
get arbolado-lineal.csv "$BA_DATA/atencion-ciudadana/arbolado-publico-lineal/arbolado-publico-lineal-2017-2018.csv"

echo '> park trees'
get arbolado-verdes.csv "$BA_DATA/ministerio-de-espacio-publico-e-higiene-urbana/arbolado-espacios-verdes/arbolado-en-espacios-verdes.csv"

echo '> OSM extract'
get BuenosAires.osm.pbf https://download.bbbike.org/osm/bbbike/BuenosAires/BuenosAires.osm.pbf
osmium extract -b -58.56,-34.73,-58.30,-34.50 BuenosAires.osm.pbf -o ba-bbox.pbf --overwrite -s smart
osmium tags-filter ba-bbox.pbf nwr/highway nwr/railway w/waterway nwr/natural nwr/landuse nwr/leisure \
  nwr/amenity=parking,university,school,hospital,grave_yard,place_of_worship nwr/boundary=administrative \
  nwr/place nwr/tourism nwr/historic nwr/man_made=pier,bridge,breakwater nwr/aeroway nwr/area:highway \
  nwr/building=stadium,train_station,cathedral,church nwr/name -o ba-filtered.pbf --overwrite
osmium export ba-filtered.pbf -f geojsonseq -o ba.geojsonseq --overwrite -a type,id

echo 'done'
