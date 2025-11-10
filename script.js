console.log("Script has loaded - Proceeding...");

// Dimensions & margins 
const margin = { top: 40, right: 40, bottom: 110, left: 80 };
const innerWidth = 550 - margin.left - margin.right;
const innerHeight = 450 - margin.top - margin.bottom;

// Global storage of raw data for filtering
let GLOBAL_RAW_DATA = [];

// Create tooltip element 
const tooltip = d3.select("body")
  .append("div")
  .attr("class", "tooltip")
  .style("position", "absolute")
  .style("pointer-events", "none")
  .style("opacity", 0);

// Utility: safe number parse
function toNumberSafe(v) {
  const n = +v;
  return isNaN(n) ? null : n;
}

// Load CSV and initialize everything
d3.csv("Data/gym_members_exercise_tracking.csv")
  .then(function(rawData) {
    console.log("CSV loaded:", rawData);

    // Parse numeric columns if they exist
    rawData.forEach(d => {
      d.Calories_Burned = toNumberSafe(d.Calories_Burned);
      d.Max_BPM = toNumberSafe(d.Max_BPM);
      const ageVal = toNumberSafe(d.Age);
      if (ageVal !== null) d.Age = ageVal;
      d.Workout_Type = (d.Workout_Type || "").trim();
      d.Gender = (d.Gender || "").trim();
    });

    // Save original for filters
    GLOBAL_RAW_DATA = rawData;

    // Build initial aggregated data and render
    const initial = aggregateData(rawData);
    createCalorieChart(initial);
    createBPMChart(initial);
    populateTable(initial);

    // Initialize filters UI
    initFilters();

  })
  .catch(err => {
    console.error("Failed to load CSV:", err);
    d3.select("#calorie-chart").append("div").text("Error loading data.");
    d3.select("#bpm-chart").append("div").text("Error loading data.");
  });

/* ------------------------
   Data aggregation helper
   ------------------------ */
function aggregateData(rows) {
  const grouped = d3.group(rows, d => d.Workout_Type, d => d.Gender);
  const chartData = [];

  for (const [workout, genderMap] of grouped.entries()) {
    const maleList = genderMap.get("Male") || [];
    const femaleList = genderMap.get("Female") || [];

    const maleCalories = d3.mean(maleList, d => d.Calories_Burned) || 0;
    const femaleCalories = d3.mean(femaleList, d => d.Calories_Burned) || 0;
    const maleBPM = d3.mean(maleList, d => d.Max_BPM) || 0;
    const femaleBPM = d3.mean(femaleList, d => d.Max_BPM) || 0;

    chartData.push({
      workout,
      maleCalories,
      femaleCalories,
      maleBPM,
      femaleBPM
    });
  }

  chartData.sort((a, b) => d3.ascending(a.workout, b.workout));
  return chartData;
}

/* ------------------------
   Chart: Average Calories
   ------------------------ */
function createCalorieChart(data) {
  d3.select("#calorie-chart").selectAll("*").remove();
  if (!data || data.length === 0) {
    d3.select("#calorie-chart").append("div").style("padding", "30px").text("No data to display.");
    return;
  }

  const maxCalories = d3.max(data, d => Math.max(d.maleCalories, d.femaleCalories)) || 0;
  const yMax = maxCalories > 0 ? maxCalories * 1.1 : 10;

  const svg = d3.select("#calorie-chart")
    .append("svg")
    .attr("viewBox", `0 0 ${innerWidth + margin.left + margin.right} ${innerHeight + margin.top + margin.bottom}`)
    .attr("preserveAspectRatio", "xMidYMid meet")
    .classed("responsive-svg", true)
    .append("g")
    .attr("transform", `translate(${margin.left},${margin.top})`);

  const x0 = d3.scaleBand()
    .domain(data.map(d => d.workout))
    .range([0, innerWidth])
    .padding(0.3);

  const x1 = d3.scaleBand()
    .domain(["Male", "Female"])
    .range([0, x0.bandwidth()])
    .padding(0.1);

  const y = d3.scaleLinear()
    .domain([0, yMax])
    .nice()
    .range([innerHeight, 0]);

  const color = d3.scaleOrdinal()
    .domain(["Male", "Female"])
    .range(["#4caf50", "#ec407a"]);

  // Axes
  svg.append("g")
    .attr("class", "x-axis")
    .attr("transform", `translate(0,${innerHeight})`)
    .call(d3.axisBottom(x0))
    .selectAll("text")
    .attr("transform", "rotate(-45)")
    .style("text-anchor", "end")
    .style("font-size", "12px")
    .style("fill", "#388e3c");

  svg.append("g")
    .attr("class", "y-axis")
    .call(d3.axisLeft(y).ticks(8))
    .selectAll("text")
    .style("font-size", "12px")
    .style("fill", "#388e3c");

  svg.append("text")
    .attr("transform", "rotate(-90)")
    .attr("y", -margin.left + 15)
    .attr("x", -(innerHeight / 2))
    .attr("dy", "1em")
    .style("text-anchor", "middle")
    .style("font-weight", "600")
    .style("fill", "#2e7d32")
    .text("Average Calories Burned");

  const groups = svg.selectAll(".workout-group")
    .data(data, d => d.workout)
    .enter().append("g")
    .attr("class", "workout-group")
    .attr("transform", d => `translate(${x0(d.workout)},0)`);

  groups.append("rect")
    .attr("class", "bar-male")
    .attr("x", x1("Male"))
    .attr("y", innerHeight)
    .attr("width", x1.bandwidth())
    .attr("height", 0)
    .attr("fill", color("Male"))
    .attr("rx", 5)
    .transition()
    .duration(900)
    .attr("y", d => y(d.maleCalories))
    .attr("height", d => innerHeight - y(d.maleCalories));

  groups.append("rect")
    .attr("class", "bar-female")
    .attr("x", x1("Female"))
    .attr("y", innerHeight)
    .attr("width", x1.bandwidth())
    .attr("height", 0)
    .attr("fill", color("Female"))
    .attr("rx", 5)
    .transition()
    .duration(900)
    .delay(150)
    .attr("y", d => y(d.femaleCalories))
    .attr("height", d => innerHeight - y(d.femaleCalories));

  svg.selectAll(".bar-male, .bar-female")
    .on("mouseover", function(event, d) {
      const isMale = d3.select(this).classed("bar-male");
      const label = isMale ? "Male" : "Female";
      const value = isMale ? d.maleCalories : d.femaleCalories;
      d3.select(this).transition().duration(150).attr("opacity", 0.8);
      showTooltip(event, `${d.workout} — ${label}`, `${value.toFixed(1)} cal`, "Average calories");
    })
    .on("mousemove", function(event) {
      updateTooltipPosition(event);
    })
    .on("mouseout", function() {
      d3.select(this).transition().duration(150).attr("opacity", 1);
      hideTooltip();
    });

  const legend = svg.append("g")
    .attr("transform", `translate(${innerWidth - 120}, -10)`);

  legend.append("rect").attr("x", 0).attr("y", 0).attr("width", 22).attr("height", 22).attr("rx", 4).attr("fill", color("Male"));
  legend.append("text").attr("x", 30).attr("y", 11).attr("dy", ".35em").text("Male").style("fill", "#388e3c");
  legend.append("rect").attr("x", 0).attr("y", 30).attr("width", 22).attr("height", 22).attr("rx", 4).attr("fill", color("Female"));
  legend.append("text").attr("x", 30).attr("y", 41).attr("dy", ".35em").text("Female").style("fill", "#388e3c");
}

/* ------------------------
   Chart: Average Max BPM
   ------------------------ */
function createBPMChart(data) {
  d3.select("#bpm-chart").selectAll("*").remove();
  if (!data || data.length === 0) {
    d3.select("#bpm-chart").append("div").style("padding", "30px").text("No data to display.");
    return;
  }

  const maxBPM = d3.max(data, d => Math.max(d.maleBPM, d.femaleBPM)) || 0;
  const yMax = maxBPM > 0 ? maxBPM * 1.1 : 100;

  const svg = d3.select("#bpm-chart")
    .append("svg")
    .attr("viewBox", `0 0 ${innerWidth + margin.left + margin.right} ${innerHeight + margin.top + margin.bottom}`)
    .attr("preserveAspectRatio", "xMidYMid meet")
    .classed("responsive-svg", true)
    .append("g")
    .attr("transform", `translate(${margin.left},${margin.top})`);

  const x0 = d3.scaleBand()
    .domain(data.map(d => d.workout))
    .range([0, innerWidth])
    .padding(0.3);

  const x1 = d3.scaleBand()
    .domain(["Male", "Female"])
    .range([0, x0.bandwidth()])
    .padding(0.1);

  const y = d3.scaleLinear().domain([0, yMax]).nice().range([innerHeight, 0]);
  const color = d3.scaleOrdinal().domain(["Male", "Female"]).range(["#4caf50", "#ec407a"]);

  svg.append("g")
    .attr("transform", `translate(0,${innerHeight})`)
    .call(d3.axisBottom(x0))
    .selectAll("text").attr("transform", "rotate(-45)").style("text-anchor", "end").style("fill", "#388e3c");

  svg.append("g")
    .call(d3.axisLeft(y).ticks(8))
    .selectAll("text").style("fill", "#388e3c");

  svg.append("text")
    .attr("transform", "rotate(-90)")
    .attr("y", -margin.left + 15)
    .attr("x", -(innerHeight / 2))
    .attr("dy", "1em")
    .style("text-anchor", "middle")
    .style("font-weight", "600")
    .style("fill", "#2e7d32")
    .text("Average Max BPM");

  const groups = svg.selectAll(".workout-group")
    .data(data, d => d.workout)
    .enter().append("g")
    .attr("class", "workout-group")
    .attr("transform", d => `translate(${x0(d.workout)},0)`);

  groups.append("rect")
    .attr("class", "bar-male")
    .attr("x", x1("Male"))
    .attr("y", innerHeight)
    .attr("width", x1.bandwidth())
    .attr("height", 0)
    .attr("fill", color("Male"))
    .attr("rx", 5)
    .transition()
    .duration(900)
    .attr("y", d => y(d.maleBPM))
    .attr("height", d => innerHeight - y(d.maleBPM));

  groups.append("rect")
    .attr("class", "bar-female")
    .attr("x", x1("Female"))
    .attr("y", innerHeight)
    .attr("width", x1.bandwidth())
    .attr("height", 0)
    .attr("fill", color("Female"))
    .attr("rx", 5)
    .transition()
    .duration(900)
    .delay(150)
    .attr("y", d => y(d.femaleBPM))
    .attr("height", d => innerHeight - y(d.femaleBPM));

  svg.selectAll(".bar-male, .bar-female")
    .on("mouseover", function(event, d) {
      const isMale = d3.select(this).classed("bar-male");
      const label = isMale ? "Male" : "Female";
      const value = isMale ? d.maleBPM : d.femaleBPM;
      d3.select(this).transition().duration(150).attr("opacity", 0.8);
      showTooltip(event, `${d.workout} — ${label}`, `${value.toFixed(1)} bpm`, "Average max BPM");
    })
    .on("mousemove", function(event) {
      updateTooltipPosition(event);
    })
    .on("mouseout", function() {
      d3.select(this).transition().duration(150).attr("opacity", 1);
      hideTooltip();
    });

  const legend = svg.append("g").attr("transform", `translate(${innerWidth - 120}, -10)`);
  legend.append("rect").attr("x", 0).attr("y", 0).attr("width", 22).attr("height", 22).attr("rx", 4).attr("fill", color("Male"));
  legend.append("text").attr("x", 30).attr("y", 11).attr("dy", ".35em").text("Male").style("fill", "#388e3c");
  legend.append("rect").attr("x", 0).attr("y", 30).attr("width", 22).attr("height", 22).attr("rx", 4).attr("fill", color("Female"));
  legend.append("text").attr("x", 30).attr("y", 41).attr("dy", ".35em").text("Female").style("fill", "#388e3c");
}

/* ------------------------
   Table population
   ------------------------ */
function populateTable(data) {
  const tbody = d3.select("#stats-tbody");
  tbody.selectAll("*").remove();

  if (!data || data.length === 0) {
    tbody.append("tr").append("td").attr("colspan", 5).text("No data for selected filters.");
    return;
  }

  const rows = tbody.selectAll("tr").data(data, d => d.workout).enter().append("tr");
  rows.append("td").text(d => d.workout).style("font-weight", "600").style("color", "#2e7d32");
  rows.append("td").text(d => d.maleCalories.toFixed(1) + " cal");
  rows.append("td").text(d => d.femaleCalories.toFixed(1) + " cal");
  rows.append("td").text(d => d.maleBPM.toFixed(1) + " bpm");
  rows.append("td").text(d => d.femaleBPM.toFixed(1) + " bpm");
}

/* ------------------------
   Tooltip helpers
   ------------------------ */
function showTooltip(event, title, value, subtitle) {
  tooltip.html(`
    <div class="tooltip-workout">${title}</div>
    <div class="tooltip-value">${value}</div>
    <div class="tooltip-label">${subtitle || ""}</div>
  `)
    .style("left", "0px")
    .style("top", "0px")
    .style("opacity", 1)
    .classed("visible", true);

  updateTooltipPosition(event);
}

function updateTooltipPosition(event) {
  const marginGap = 12;
  const tooltipNode = tooltip.node();
  if (!tooltipNode) return;
  const ttWidth = tooltipNode.offsetWidth;
  const ttHeight = tooltipNode.offsetHeight;

  let left = event.pageX + marginGap;
  let top = event.pageY - (ttHeight / 2);

  const rightEdge = window.pageXOffset + window.innerWidth;
  if (left + ttWidth + 10 > rightEdge) {
    left = event.pageX - ttWidth - marginGap;
  }
  if (top < window.pageYOffset + 10) top = window.pageYOffset + 10;
  if (top + ttHeight > window.pageYOffset + window.innerHeight - 10) top = window.pageYOffset + window.innerHeight - ttHeight - 10;

  tooltip.style("left", `${left}px`).style("top", `${top}px`);
}

function hideTooltip() {
  tooltip.style("opacity", 0).classed("visible", false);
}

/* ------------------------
   Filters: init & apply
   ------------------------ */
function initFilters() {
  d3.selectAll(".workout-checkbox").on("change", applyFilters);
  d3.selectAll(".gender-radio").on("change", applyFilters);

  const minSlider = d3.select("#age-slider-min");
  const maxSlider = d3.select("#age-slider-max");
  const ageDisplay = d3.select("#age-display");

  function updateAgeText() {
    let minV = +minSlider.property("value");
    let maxV = +maxSlider.property("value");
    if (minV > maxV) {
      if (this === minSlider.node()) {
        maxSlider.property("value", minV);
        maxV = minV;
      } else {
        minSlider.property("value", maxV);
        minV = maxV;
      }
    }
    ageDisplay.text(`${minV} - ${maxV}`);
  }

  minSlider.on("input", function() { updateAgeText(); applyFilters(); });
  maxSlider.on("input", function() { updateAgeText(); applyFilters(); });
}

function applyFilters() {
  let selectedWorkouts = [];
  d3.selectAll(".workout-checkbox").each(function() {
    const cb = d3.select(this);
    if (cb.property("checked")) selectedWorkouts.push(cb.property("value"));
  });

  const gender = d3.select('input[name="gender"]:checked').property("value");
  const minAge = +d3.select("#age-slider-min").property("value");
  const maxAge = +d3.select("#age-slider-max").property("value");

  let filtered = GLOBAL_RAW_DATA.filter(d => selectedWorkouts.includes(d.Workout_Type));
  if (gender !== "All") filtered = filtered.filter(d => d.Gender === gender);
  filtered = filtered.filter(d => d.Age >= minAge && d.Age <= maxAge);

  const aggData = aggregateData(filtered);
  createCalorieChart(aggData);
  createBPMChart(aggData);
  populateTable(aggData);
}
