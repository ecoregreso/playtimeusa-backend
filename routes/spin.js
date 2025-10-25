const crypto = require('crypto');
const router = require('express').Router();

// symbol weights and payouts
const symbols = [
  {k:'A', w:5, p:5},
  {k:'B', w:8, p:3},
  {k:'C', w:12, p:2},
  {k:'D', w:20, p:1},
];

const lines = [
  [[0,0],[0,1],[0,2]],
  [[1,0],[1,1],[
