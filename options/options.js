"use strict";

const limitsList = document.getElementById("limits-list");
const limitRowTemplate = document.getElementById("limit-row-template");

function addLimitRow(domain = "", minutes = 30) {
  const row = limitRowTemplate.content.firstElementChild.cloneNode(true);
  row.querySelector(".limit-domain").value = domain;
  row.querySelector(".limit-minutes").value = minutes;
  row.querySelector(".remove-limit").addEventListener("click", () => row.remove());
  limitsList.append(row);
}

document.getElementById("add-limit").addEventListener("click", () => addLimitRow());

addLimitRow();

