import * as d3 from "d3";
import { count, scaleLinear } from "d3";

export default class Graph{

    constructor(id, countries){
        this.id = id;
        this.isCurrent = false;
        this.isMinimized = false;
        this.position = {x: 0, y: 0};
        this.width = 500;
        this.height = 400;
        this.padding = (this.width / 100) * 2;

        this.countries = countries;
       
        this.container = null;
        this.header = null;
        this.graph = null;
        this.rects = null;
        this.flags = null;
        this.tooltip = d3.select("#graph-tooltip");
        this.generateGraph();
    }

    generateGraph(){
        this.container = d3.select('body').append(`div`)
        .attr("class", `graph`)
        .attr("data-graph", `${this.id}`)
        .call(d3.drag().on("drag", this.dragGraph.bind(this)));
        this.generateHeader();
        this.graph = this.container.append("svg")
        .attr("width", this.width)
        .attr("height", this.height)
        .attr("style", `transform: rotateX(180deg)`);
    }

    generateHeader(){
        let data = ["move", "minimize", 'close'];
        this.header = this.container.append("header");
        this.header.attr("class", `graph__header`);
        let buttons = this.header.selectAll("button").data(data);
        buttons.enter().append("button")
        .attr("class", 'graph__button')
        .attr("title", d => `${d} the graph`)
        .attr("data-action", d => `${d}`)
        .html( d => `<img src='./assets/img/${d}-icon.png'></img>`);
    }

    generateRects(){
        let scaleHelper = this.getScaleHelper();
        let scaleColorHelper = this.getScaleColorHelper();
        let rectWidth = (this.width - (this.padding)) / this.countries.length;
        rectWidth = Math.min(30, rectWidth);
        this.rects = this.graph.selectAll("rect").data(this.countries);
        this.rects.exit().remove();
        this.rects.enter().append("rect").merge(this.rects)
        .on("mousemove", this.hydrateTooltip.bind(this))
        .on("mouseout", () => this.tooltip.attr("style", "display: none;"))
        .attr("x", (d, i) => (((rectWidth) * i) + this.padding)).attr("y", this.padding * 4)
        .attr("rx", 5)
        .attr('width', rectWidth - this.padding / 2)
        .attr("data-flag", (d) => d.flag)
        .attr('data-country', (d) => d.name)
        .attr('data-population', (d) => d.population)
        .transition()
        .duration(300)
        .delay((d, i) => i * 250)
        .attr('height', (d) => scaleHelper(d.population))
        .attr('fill', (d, i) => scaleColorHelper(i))
        this.generateFlags(rectWidth);
    }

    generateFlags(rectWidth){
        this.flags = this.graph.selectAll("text:not(title text)").data(this.countries);
        this.flags.exit().remove();
        this.flags.enter().append("text").merge(this.flags)
        .attr("x", (d, i) => (((rectWidth) * i) + this.padding)).attr("y", this.padding * 3)
        .attr("font-size", rectWidth - (this.padding / 2))
        .text((d) => d.flag);
    }

    hydrateTooltip(e){
        let country = this.countries.find(c => c.name === e.target.dataset.country);
        this.tooltip.attr("style", `top: ${e.y}px; left: ${e.x}px; display: block;`);
        let infos = this.tooltip.selectAll("p").data(Object.values(country));
        infos.exit().remove();
        infos.enter().append("p").merge(infos)
        .text(d => typeof d === "number" ? d3.format(",")(d) : d);
    }

    hydrateGraph(countries){
        this.countries = countries;
        this.generateRects();
    }

    dragGraph(e){
        if(document.activeElement.dataset.action !== "move") return;
        let offset = 20;
        this.position = {x: e.x - offset, y: e.y - offset};
        let {width, height} = this.container.node().getBoundingClientRect()
        this.container.attr("style", `top: ${e.y - offset}px; left: ${e.x - offset}px; width: ${width}px; height: ${height}px`);
    }

    toggleMinimize(){
        this.isMinimized = !this.isMinimized;
    
        let top = this.isMinimized ? `${window.innerHeight - 35}px` : `${this.position.y}px` ;
        let left = this.isMinimized ? `${0 + (this.id * 120)}px` : `${this.position.x}px`;
        
        this.container.transition().duration(300).ease(d3.easeSin).attr("style", `top: ${top}; left: ${left};`);

        let maxWidth = this.isMinimized ? `120px` : 'auto';
        this.header.transition().duration(300).ease(d3.easeSin).attr("style", `max-width: ${maxWidth};`)

        let display = this.isMinimized ? 'none' : 'block';
        this.graph.transition().duration(300).ease(d3.easeSin).attr("style", `display: ${display}; transform: rotateX(180deg);`)
    }

    getScaleHelper(){ return d3.scaleLinear().domain([0, this.getHigher("population")]).range([3, this.height - (this.padding * 5)]) }

    getScaleColorHelper(){ return scaleLinear().domain([0, this.countries.length - 1]).range(["#2c3e50", "#c43636"]).interpolate(d3.interpolateHcl)}

    getHigher(prop){ return d3.max(this.countries, (d) => +d[prop]) }
}