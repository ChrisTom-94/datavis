import './style.css';
import * as d3 from "d3";
import * as topojson from "topojson-client";

const worker = new Worker("./worker.js");

const width = 500;
const height = 500;
let speedRotation = 3;
d3.select('#speed-rotation').on("change", e => speedRotation = parseInt(e.target.value));

let timestamp = 0;

const projection = d3.geoOrthographic().translate([width / 2, height / 2]).precision(.1);
const canvas = d3.select("#canvas-container").append("canvas");
canvas.attr("width", width).attr("height", height);
const ctx = canvas.node().getContext("2d");
const globe = d3.geoPath(projection).context(ctx);
let paths, countries;

(async () => {
    const data = await d3.json('https://unpkg.com/world-atlas@1/world/110m.json');
    // const csv = await d3.csv("./data/gpw_v4_admin_unit_center_points_population_estimates_rev11_global.csv")
    // console.log(csv);
    paths = topojson.feature(data, data.objects.land)
    countries = topojson.feature(data, data.objects.countries)
    requestAnimationFrame(render)
})();

function fillPath(path, color){
    ctx.beginPath();
    globe(path);
    ctx.fillStyle = color;
    ctx.fill();
    ctx.closePath();
}

function strokePath(path, color){
    ctx.beginPath();
    globe(path);
    ctx.strokeStyle = color;
    ctx.stroke();
    ctx.closePath();
}

function draw(){
    fillPath({type: "Sphere"}, "#1a285a");
    fillPath(paths, "#3b5842");
}

function rotate(difference){
    let rotation = projection.rotate();
    rotation[0] =+ difference * (speedRotation / 100);
    projection.rotate(rotation);
}

function render(currentTime){
    ctx.clearRect(0,0, width, height);
    draw();
    requestAnimationFrame(render);
    const [stop, difference] = wait(currentTime);
    if(stop) return;
    rotate(difference);
}

function wait(currentTime){
    let stop = true;
    let difference = currentTime - timestamp;
    if(difference >= currentTime) {
        return [!stop, difference];
    }
    timestamp = currentTime;
    return [stop, 0];
}

function CSVToArray( csv, delimiter ){
    delimiter = (delimiter || ",");

    const pattern = new RegExp(
          // Delimiters.                          // Quoted fields.                    // Standard fields.
        ("(\\" + delimiter + "|\\r?\\n|\\r|^)" + "(?:\"([^\"]*(?:\"\"[^\"]*)*)\"|" + "([^\"\\" + delimiter + "\\r\\n]*))"),"gi"
        );

    let array = [[]];
    let matches = null;

    while (matches = pattern.exec( csv )){
        // get delimiter and one of both quoted or unquoted value
        const [, matchedDelimiter, quotedValue = null, unquotedValue = null] = matches;
        
        // mached delimiter is different to our delimiter so we have new line
        if (matchedDelimiter.length && (matchedDelimiter != delimiter)) array.push([]);

        let matchedValue;
        // if we have a quoted value by regex capturing group then we replace quote, else we just get unquoted value
        quotedValue ? matchedValue = quotedValue.replace(new RegExp("\"\"", "g"), "\"") : matchedValue = unquotedValue

        // fill array to return
        array = array.map((subarray, i) => i === array.length - 1 ? [...subarray, matchedValue] : [...subarray]);
    }
    return( array );
}





