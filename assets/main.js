import "./style.css";
import * as d3 from "d3";
import * as topojson from "topojson-client";
import Graph from "./scripts/Graph";

// put all code in anonym function to avoid access them from the console
(() => {
    const ATLAS_LAND_URL = "https://unpkg.com/world-atlas@2/land-110m.json";
    const ATLAS_COUNTRIES_URL = "https://unpkg.com/world-atlas@2/countries-110m.json";
    const ATLAS_COUNTRIES_LIST_URL = "https://gist.githubusercontent.com/mbostock/4090846/raw/07e73f3c2d21558489604a0bc434b3a5cf41a867/world-country-names.tsv"
    const COUNTRIES_URL = "https://restcountries.com/v3.1/all";
    const TOTAL_POPULATION_URL = "https://d6wn6bmjj722w.population.io:443/1.0/population/World/today-and-tomorrow";
    
    let canvasOptions = {
        width: Math.min(550, window.innerWidth),
        height: Math.min(550, window.innerWidth),
        dragFactor: 50,
        scaleFactor: 25,
        speedRotation: 2
    }
    
    const randomInt = (min = 1, max = 4) => Math.floor(Math.random() * (max - min + 1) + min);
    const clamp = (n, min, max) => Math.min(Math.max(n, min), max);
    const randomCountry = () => countries[randomInt(0, countries.length -1)];
    
    const maxGraphs = 3;

    let countries = [], 
        totalPopulation = 0,
        flagSlider = null,
        currentFlag = null,
        landPath = null,
        countriesPath = null,
        projection = null,
        geoPath = null,
        globeRotation = [0, 0, 0],
        timestamp = 0,
        isGlobeHover = false,
        hoverCountry = null,
        selectedCountries = [],
        selectedCountriesPaths = [],
        graphs = [],
        currentGraph = null;
        
    (async () => {

        // total population
        let totalPopulationData = await d3.json(TOTAL_POPULATION_URL);
        totalPopulation = totalPopulationData["total_population"][0].population;
        d3.select("#total-population").text(d3.format(",")(totalPopulation));
        d3.interval(animateTotalPopulation, 1000);

        // get countries
        countries = await d3.json(COUNTRIES_URL);
        countries = countries.map(filterCountriesData);

    
        // get globe geojson
        let atlasLand = await d3.json(ATLAS_LAND_URL);
        let atlasCountries = await d3.json(ATLAS_COUNTRIES_URL);
    
        let atlasCountriesList = await d3.tsv(ATLAS_COUNTRIES_LIST_URL);
        atlasCountriesList = fixCountriesNames(atlasCountriesList);
    
        // convert geojson to polygon
        landPath = topojson.feature(atlasLand, atlasLand.objects.land);
        countriesPath = topojson.feature(atlasCountries, atlasCountries.objects.countries);
        countriesPath = hydrateCountriesPaths(atlasCountriesList, countriesPath);
    
        // init globe
        let {width, height} = canvasOptions
        let globeCanvas = d3.select("#globe-container")
            .append("canvas")
            .attr("width", width)
            .attr("height", height)
            .attr("data-globe", true)
            .on("mousemove", onMouseMove)
            .on("click", onClick)
            .call(d3.drag().on("drag", onDrag))
            .call(d3.zoom().on("zoom", onZoom));
    
        let ctx = globeCanvas.node().getContext("2d");
        projection = d3.geoOrthographic().translate([width / 2, height / 2]).rotate([0, 0]).precision(0.1);
        geoPath = d3.geoPath(projection).context(ctx);
    
        animateGlobe();
    
        // init flags animation
        flagSlider = d3.select("#flag-slider");
        flagSlider.selectAll("span").data(countries)
        .enter()
        .append("span")
        .attr("data-flag", (d) => d.name)
        .text(d => d.flag);
        currentFlag = randomCountry();
    
        animateFlags();
        d3.interval(animateFlags, randomInt(5, 7) * 1000);

        d3.select("#add-chart").on("click", addGraph);
    
        // global events
        window.addEventListener("resize", onResizeWindow);
        window.addEventListener("mousemove", onMouseMoveWindow);
        window.addEventListener("click", onClickWindow);
    
    })();
    
    
    function filterCountriesData(country){
        let {name: {common}, population, flag} = country;
        return {name: common, population, flag};
    }
    
    function animateTotalPopulation(){
        totalPopulation += randomInt();
        d3.select("#total-population").text(d3.format(",")(totalPopulation));
    }
    
    function fixCountriesNames(countriesList){
        let toReplace = [
            ["Russian Federation", "Russia"], 
            ["Venezuela, Bolivarian Republic of", "Venezuela"], 
            ["Congo, the Democratic Republic of the", "DR Congo"],
            ["Congo", "Republic of the Congo"],
            ["Iran, Islamic Republic of", "Iran"],
            ["Côte d'Ivoire", "Ivory Coast"],
            ["Korea, Democratic People's Republic of", "North Korea"],
            ["Korea, Republic of", "South Korea"],
            ["Bolivia, Plurinational State of", "Bolivia"],
            ["Czech Republic", "Czechia"],
            ["Viet Nam", "Vietnam"],
            ["Lao People's Democratic Republic", "Laos"],
            ["Syrian Arab Republic", "Syria"],
            ["Somaliland", "Mali"],
            ["Tanzania, United Republic of", "Tanzania"],
        ];
        return countriesList.map(c => {
            let replacement = toReplace.find(([replaced]) => replaced === c.name)
            return replacement ? {...c, name: replacement[1]} : c;
        });
    }
    
    function hydrateCountriesPaths(countries, paths){
        countries.forEach(country => {
            paths.features = paths.features.map(path => (
                parseInt(path.id) === parseInt(country.id) ? {...path, properties : {name: country.name}} : path
            ))
        });
        return paths;
    }
    
    function animateGlobe(elapsed) {
        const now = d3.now();
        const gap = now - timestamp;
        timestamp = now;
        requestAnimationFrame(animateGlobe);
        if (gap >= elapsed) return;
        drawGlobe();
        hoverCountry && drawGeometry( hoverCountry, "#c43636", "fill");
        selectedCountriesPaths[currentGraph]?.forEach(country => drawGeometry(country, "#c43636", "fill"))
        !isGlobeHover && rotateGlobe(gap);
    }
    
    function drawGlobe(){
        let {width, height} = canvasOptions
        geoPath.context().clearRect(0, 0, width, height);
    
        let paths = [
            { geometry: { type: "Sphere" }, color: "#0074ba", type: "fill" },
            { geometry: landPath, color: "#00d26a", type: "fill" },
            { geometry: countriesPath, color: "#ffffff", type: "stroke" },
        ];
        paths.forEach(({ geometry, color, type }) => drawGeometry(geometry, color, type));
    }
    
    function drawGeometry(geometry, color, type){
        let ctx = geoPath.context();
        ctx.beginPath();
        geoPath(geometry);
        ctx[`${type}Style`] = color;
        ctx.lineWidth = 0.5;
        ctx[type]();
        ctx.closePath();
    }
    
    function findCountry(e) {
        // get mouse position based on projection
        const mousePosition = projection.invert(d3.pointer(e));
        return countriesPath.features.find((country) => (
          country.geometry.coordinates.some((polygon) =>(
              d3.polygonContains(polygon, mousePosition) ||
              polygon.some((subPoly) => d3.polygonContains(subPoly, mousePosition))
          )))
        ) ?? null;
    }
    
    function rotateGlobe(gap) {
        let {speedRotation} = canvasOptions
        globeRotation = projection.rotate();
        globeRotation[0] += gap * (speedRotation / 100);
        projection.rotate(globeRotation);
    }
    
    function hydrateGlobeTooltip(country, x, y){
        let hoverCountryEl = d3.select('#hover-country');
        let offset = 10;
        country ? hoverCountryEl.html(`<p>${country.name}</p><p>${country.flag}</p>`)
                                .style("top", `${y + offset}px`)
                                .style("left", `${x + offset}px`) 
                                .style("display", `block`) 
                : hoverCountryEl.html("")
                                .style("top", `0`)
                                .style("left", `0`)
                                .style("display", `none`) 
    }
    
    function animateFlags(){
        // remove class to old flag
        let currentFlagElement = flagSlider.select(`span[data-flag='${currentFlag.name}']`)
        currentFlagElement.attr("class", "");
        
        
        let oldPopulation = currentFlag.population
        // get new country
        currentFlag = randomCountry();
    
        // hydrate flag element and tooltip
        currentFlagElement = flagSlider.select(`span[data-flag='${currentFlag.name}']`);
        currentFlagElement.attr("class", "current")
        hydrateFlagInfo(oldPopulation);
        currentFlagElement.node().scrollIntoView({behavior: "smooth", inline: "start"});
    }

    function hydrateFlagInfo(){
        let flagName = d3.selectAll("#current-flag-name");
        flagName.transition()
        .text(currentFlag.name)

        let flagPopulationElement = d3.select("#current-flag-population");
        flagPopulationElement.transition()
        .text(() => (d3.format(",")(currentFlag.population)))
    }

    function hydrateSelectedCountries(country, path, action = "add"){
        if(action === "remove") {
            selectedCountries[currentGraph] = selectedCountries[currentGraph].filter(c => c.name !== country.name)
            selectedCountriesPaths[currentGraph] = selectedCountriesPaths[currentGraph].filter(p => p.id === path.id)
        }
        else {
            if(selectedCountries[currentGraph] && 
                selectedCountries[currentGraph].findIndex(c => c.name === country.name) >= 0
                ){ 
                hydrateSelectedCountries(country, path, "remove");
            }
            else{
                if(!selectedCountries[currentGraph]) {
                    selectedCountries[currentGraph] = [];
                    selectedCountriesPaths[currentGraph] = [];
                }
                selectedCountries[currentGraph] = [...selectedCountries[currentGraph], country];
                selectedCountriesPaths[currentGraph] = [...selectedCountriesPaths[currentGraph], path]
            }
        }
    }

    function addGraph(){
        if(graphs.length >= maxGraphs) return;
        currentGraph = graphs.length;
        selectedCountries[currentGraph] = [];
        selectedCountriesPaths[currentGraph] = [];
        graphs = [...graphs, new Graph(currentGraph, selectedCountries[currentGraph])];
        hydrateCurrentGraph();
    }

    function removeGraph(id, graph){
        selectedCountries.splice(id, 1);
        selectedCountriesPaths.splice(id, 1);
        graphs.splice(id, 1);
        graph.remove();
        currentGraph = graphs[graphs.length - 1]?.id;
        hydrateCurrentGraph();
    }

    function toggleMinimizeGraph(id){
        let graph = graphs.find(g => g.id === id);
        graph.toggleMinimize();
        console.log(graph.isMinimized)
        if(!graph.isMinimized) hydrateCurrentGraph(id);
    }

    function hydrateCurrentGraph(id = currentGraph){
        if(id !== currentGraph) currentGraph = id;
        graphs.forEach(g => {
            g.isCurrent = g.id === id;
            g.container.attr("class", `graph ${g.isCurrent ? 'graph--current' : ''}`)
            g.header.attr("class", `graph__header ${g.isCurrent ? "graph__header--current" : ''}`);
        });
    }

    function removeCountryFromSelection(id, flag){
        let {name} = countries.find(c => c.flag === flag)
        selectedCountries[id] = selectedCountries[id].filter(c => c.flag !== flag);
        selectedCountriesPaths[id] = selectedCountriesPaths[id].filter(c => c.properties.name !== name);
        graphs[id].hydrateGraph(selectedCountries[id]);
    }
    
    // events callbacks
    
    function onMouseMove(e) {
        isGlobeHover = true;
        hoverCountry = findCountry(e);
        let country = countries.find(c => c.name === hoverCountry?.properties.name);
        hydrateGlobeTooltip(country, e.clientX, e.clientY);
        country && drawGeometry(hoverCountry, "#c43636", "fill");
    }
    
    function onClick(e) {
        let clickedPath = findCountry(e);
        let country = countries.find(c => c.name === clickedPath?.properties.name)
        if(!country) return
        if(!graphs.length) addGraph()
        hydrateSelectedCountries(country, clickedPath);
        graphs[currentGraph].hydrateGraph(selectedCountries[currentGraph]);
    }
    
    function onDrag(e) {
        globeRotation = projection.rotate();
        let {dragFactor} = canvasOptions;
        let offset = dragFactor / projection.scale();
        globeRotation[0] += e.dx * offset;
        globeRotation[1] += (-e.dy) * offset;
        projection.rotate(globeRotation);
    }
    
    function onZoom(e) {
        let zoom = projection.scale();
        let {scaleFactor} = canvasOptions;
        e.sourceEvent.deltaY > 0 ? (zoom += scaleFactor) : (zoom -= scaleFactor);
        zoom = clamp(zoom, 200, 300);
        projection.scale(zoom);
    }
    
    function onResizeWindow() {
        let {width, height} = canvasOptions;
        projection.scale((Math.min(width, height)) / 2).translate([width / 2, height / 2]);
    }
    
    function onMouseMoveWindow(e){
        if(("globe" in e.target.dataset)) return
        isGlobeHover = false;
        hydrateGlobeTooltip(null);
    }

    function onClickWindow(e){
        e.stopPropagation();
        if(!(e.target.closest(".graph"))) return
        let graph = e.target.closest(".graph")
        let id = parseInt(graph.dataset.graph);
        console.log(e)
        if(e.target.tagName === "text") {
            let flag = e.target.textContent;
            removeCountryFromSelection(id, flag)
            return;
        }
        let button;
        if(!(button = e.target.closest("[data-action]"))){
            hydrateCurrentGraph(id);
            return;
        }
        let {action} = button.dataset;
        if(action === "close") removeGraph(id, graph);
        if(action === "minimize") toggleMinimizeGraph(id);
    }
})();
