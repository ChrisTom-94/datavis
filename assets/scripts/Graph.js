import * as d3 from "d3";
import { scaleLinear } from "d3";

export default class Graph{

    constructor(countries){

        this.position = {x: 0, y: 0};
        this.width = 500;
        this.height = 400;
        this.padding = (this.width / 100) * 2;

        this.countries = countries;
       
        this.container = null;
        this.graph = null;
        this.rects = null;
    }

    generateGraph(id, countries = this.countries){
        this.id = id;
        this.container = d3.select('body').append(`div`)
        .attr("class", `graph`)
        .attr("data-graph", `${this.id}`)
        .call(d3.drag().on("drag", this.dragGraph.bind(this)));
        this.generateHeader();
        this.graph = this.container.append("svg")
        .attr("width", this.width)
        .attr("height", this.height)
        .attr("style", `transform: rotateX(180deg)`)
        this.generateRects(countries);
    }

    generateHeader(){
        let data = ["move", "minimize", 'close'];
        let header = this.container.append("header");
        header.attr("class", `graph__header`);
        let buttons = header.selectAll("button").data(data);
        buttons.enter().append("button")
        .attr("class", 'graph__button')
        .attr("title", d => `${d} the graph`)
        .attr("data-action", d => `${d}`)
        .html( d => `<img src='./assets/img/${d}-icon.png'></img>`);
    }

    generateRects(){
        let scaleHelper = this.getScaleHelper();
        let scaleColorHelper = this.getScaleColorHelper();
        let rectWidth = (this.width - (this.padding / 2)) / this.countries.length;
        rectWidth = Math.min(30, rectWidth);
        this.rects = this.graph.selectAll("rect").data(this.countries);
        this.rects.exit().remove();
        this.rects.enter().append("rect").merge(this.rects)
        .attr("x", (d, i) => (((rectWidth) * i) + this.padding / 2)).attr("y", this.padding / 2)
        .attr("rx", 5)
        .attr('width', rectWidth - this.padding / 2)
        .attr("data-flag", (d) => d.flag)
        .attr('data-country', (d) => d.name)
        .transition()
        .duration(300)
        .delay((d, i) => i * 250)
        .attr('height', (d) => scaleHelper(d.population))
        .attr('fill', (d, i) => scaleColorHelper(i))
    }

    hydrateGraph(countries){
        this.countries = countries;
        this.generateRects();
    }

    dragGraph(e){
        if(document.activeElement.dataset.action !== "move") return;
        let offset = 20;
        this.position = {x: e.x - offset, y: e.y - offset};
        this.container.attr("style", `top: ${e.y - offset}px; left: ${e.x - offset}px`);
    }

    getScaleHelper(){ return d3.scaleLinear().domain([0, this.getHigher("population")]).range([1, this.height - (this.padding * 2)]) }

    getScaleColorHelper(){ return scaleLinear().domain([0, this.countries.length - 1]).range(["#2c3e50", "#c43636"]).interpolate(d3.interpolateHcl)}

    getHigher(prop){ return d3.max(this.countries, (d) => +d[prop]) }

}