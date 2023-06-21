function drawArc(divId, xradius, yradius) {
  drawing = document.getElementById(divId);
  console.log(drawing);
  var arc = document.createElementNS("http://www.w3.org/2000/svg", "rect");
  arc.setAttribute("x", "0");
  arc.setAttribute("y", "10");
  arc.setAttribute("width", "300");
  arc.setAttribute("height", "300");
  arc.setAttribute("fill", "#ffffff");
  arc.setAttribute("stroke", "red");
  drawing.appendChild(arc);
}

function draw() {
  drawArc("arc", 30, 40);
}
