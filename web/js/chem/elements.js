/* ChemElements — the 118 elements: symbol, Arabic name, standard atomic mass, category, period/group,
 * ground-state electron configuration (Aufbau with the known exceptions), shells (K L M N …) and valence electrons. */
(function (global) {
  'use strict';
  var SYM = 'H He Li Be B C N O F Ne Na Mg Al Si P S Cl Ar K Ca Sc Ti V Cr Mn Fe Co Ni Cu Zn Ga Ge As Se Br Kr Rb Sr Y Zr Nb Mo Tc Ru Rh Pd Ag Cd In Sn Sb Te I Xe Cs Ba La Ce Pr Nd Pm Sm Eu Gd Tb Dy Ho Er Tm Yb Lu Hf Ta W Re Os Ir Pt Au Hg Tl Pb Bi Po At Rn Fr Ra Ac Th Pa U Np Pu Am Cm Bk Cf Es Fm Md No Lr Rf Db Sg Bh Hs Mt Ds Rg Cn Nh Fl Mc Lv Ts Og'.split(' ');
  var AR = ('هيدروجين هيليوم ليثيوم بيريليوم بورون كربون نيتروجين أكسجين فلور نيون صوديوم مغنيسيوم ألومنيوم سيليكون فوسفور كبريت كلور أرجون ' +
    'بوتاسيوم كالسيوم سكانديوم تيتانيوم فاناديوم كروم منغنيز حديد كوبالت نيكل نحاس خارصين غاليوم جرمانيوم زرنيخ سيلينيوم بروم كريبتون ' +
    'روبيديوم سترونشيوم إتريوم زركونيوم نيوبيوم موليبدنوم تكنيشيوم روثينيوم روديوم بالاديوم فضة كادميوم إنديوم قصدير أنتيمون تيلوريوم يود زينون ' +
    'سيزيوم باريوم لانثانوم سيريوم براسيوديميوم نيوديميوم بروميثيوم ساماريوم يوروبيوم غادولينيوم تيربيوم ديسبروسيوم هولميوم إربيوم ثوليوم إتيربيوم لوتيتيوم ' +
    'هافنيوم تنتالوم تنغستن رينيوم أوزميوم إيريديوم بلاتين ذهب زئبق ثاليوم رصاص بزموت بولونيوم أستاتين رادون ' +
    'فرانسيوم راديوم أكتينيوم ثوريوم بروتكتينيوم يورانيوم نبتونيوم بلوتونيوم أمريسيوم كوريوم بركيليوم كاليفورنيوم أينشتاينيوم فيرميوم مندليفيوم نوبليوم لورنسيوم ' +
    'رذرفورديوم دوبنيوم سيبورغيوم بوريوم هاسيوم مايتنريوم دارمشتاتيوم رونتغينيوم كوبرنيسيوم نيهونيوم فليروفيوم موسكوفيوم ليفرموريوم تينيسين أوغانيسون').split(' ');
  var MASS = [1.008, 4.0026, 6.94, 9.0122, 10.81, 12.011, 14.007, 15.999, 18.998, 20.180, 22.990, 24.305, 26.982, 28.085, 30.974, 32.06, 35.45, 39.948,
    39.098, 40.078, 44.956, 47.867, 50.942, 51.996, 54.938, 55.845, 58.933, 58.693, 63.546, 65.38, 69.723, 72.630, 74.922, 78.971, 79.904, 83.798,
    85.468, 87.62, 88.906, 91.224, 92.906, 95.95, 98, 101.07, 102.91, 106.42, 107.87, 112.41, 114.82, 118.71, 121.76, 127.60, 126.90, 131.29,
    132.91, 137.33, 138.91, 140.12, 140.91, 144.24, 145, 150.36, 151.96, 157.25, 158.93, 162.50, 164.93, 167.26, 168.93, 173.05, 174.97,
    178.49, 180.95, 183.84, 186.21, 190.23, 192.22, 195.08, 196.97, 200.59, 204.38, 207.2, 208.98, 209, 210, 222,
    223, 226, 227, 232.04, 231.04, 238.03, 237, 244, 243, 247, 247, 251, 252, 257, 258, 259, 266,
    267, 268, 269, 270, 277, 278, 281, 282, 285, 286, 289, 290, 293, 294, 294];
  var CAT = {};
  var setCat = function (name, list) { list.forEach(function (z) { CAT[z] = name; }); };
  setCat('alkali', [3, 11, 19, 37, 55, 87]); setCat('alkaline', [4, 12, 20, 38, 56, 88]);
  setCat('metalloid', [5, 14, 32, 33, 51, 52]); setCat('nonmetal', [1, 6, 7, 8, 15, 16, 34]);
  setCat('halogen', [9, 17, 35, 53, 85, 117]); setCat('noble', [2, 10, 18, 36, 54, 86, 118]);
  setCat('post', [13, 31, 49, 50, 81, 82, 83, 84, 113, 114, 115, 116]);
  for (var z = 57; z <= 71; z++) CAT[z] = 'lanthanide';
  for (z = 89; z <= 103; z++) CAT[z] = 'actinide';
  for (z = 1; z <= 118; z++) if (!CAT[z]) CAT[z] = 'transition';
  var CAT_AR = { alkali: 'فلزات قلوية', alkaline: 'فلزات قلوية ترابية', transition: 'فلزات انتقالية', post: 'فلزات أخرى', metalloid: 'أشباه فلزات',
    nonmetal: 'لافلزات', halogen: 'هالوجينات', noble: 'غازات نبيلة', lanthanide: 'لانثانيدات', actinide: 'أكتينيدات' };
  var CAT_COLOR = { alkali: '#ffc9a8', alkaline: '#ffe3a3', transition: '#f3d4d4', post: '#d5dde6', metalloid: '#cfe8c9', nonmetal: '#c8ecf5',
    halogen: '#d9d2f5', noble: '#f7cfe6', lanthanide: '#e8f0c2', actinide: '#f0e2c0' };

  // Aufbau order and the real configurations that differ from it
  var ORDER = ['1s', '2s', '2p', '3s', '3p', '4s', '3d', '4p', '5s', '4d', '5p', '6s', '4f', '5d', '6p', '7s', '5f', '6d', '7p'];
  var CAP = { s: 2, p: 6, d: 10, f: 14 };
  var EXC = { 24: { '4s': 1, '3d': 5 }, 29: { '4s': 1, '3d': 10 }, 41: { '5s': 1, '4d': 4 }, 42: { '5s': 1, '4d': 5 }, 44: { '5s': 1, '4d': 7 },
    45: { '5s': 1, '4d': 8 }, 46: { '5s': 0, '4d': 10 }, 47: { '5s': 1, '4d': 10 }, 57: { '4f': 0, '5d': 1 }, 58: { '4f': 1, '5d': 1 },
    64: { '4f': 7, '5d': 1 }, 78: { '6s': 1, '5d': 9 }, 79: { '6s': 1, '5d': 10 }, 89: { '5f': 0, '6d': 1 }, 90: { '5f': 0, '6d': 2 },
    91: { '5f': 2, '6d': 1 }, 92: { '5f': 3, '6d': 1 }, 93: { '5f': 4, '6d': 1 }, 96: { '5f': 7, '6d': 1 }, 103: { '6d': 0, '7p': 1 } };
  var NOBLE = { 2: 'He', 10: 'Ne', 18: 'Ar', 36: 'Kr', 54: 'Xe', 86: 'Rn' };

  function config(zz) {
    var left = zz, sub = [];
    ORDER.forEach(function (o) { var n = Math.min(CAP[o[1]], left); left -= n; if (n) sub.push([o, n]); });
    var ex = EXC[zz];
    if (ex) {
      var map = {}; sub.forEach(function (s) { map[s[0]] = s[1]; });
      Object.keys(ex).forEach(function (k) { map[k] = ex[k]; });
      sub = ORDER.filter(function (o) { return map[o]; }).map(function (o) { return [o, map[o]]; });
    }
    return sub;
  }
  function info(q) {
    var zz = typeof q === 'number' ? q : SYM.indexOf(String(q).trim()) + 1;
    if (!zz) { var i = AR.indexOf(String(q).trim().replace(/^ال/, '')); if (i < 0) i = AR.indexOf(String(q).trim()); zz = i + 1; }
    if (!(zz >= 1 && zz <= 118)) throw new Error('عنصر غير معروف: ' + q);
    var cfg = config(zz), shells = [];
    cfg.forEach(function (s) { var n = +s[0][0]; shells[n - 1] = (shells[n - 1] || 0) + s[1]; });
    for (var k = 0; k < shells.length; k++) shells[k] = shells[k] || 0;
    var period = shells.length, group = groupOf(zz);
    var main = group && (group <= 2 || group >= 13);
    var valence = main ? (group <= 2 ? group : group - 10) : null;
    if (zz === 2) valence = 2;
    return { z: zz, sym: SYM[zz - 1], ar: AR[zz - 1], mass: MASS[zz - 1], cat: CAT[zz], catAr: CAT_AR[CAT[zz]], color: CAT_COLOR[CAT[zz]],
      config: cfg, shells: shells, period: period, group: group, valence: valence, neutrons: Math.round(MASS[zz - 1]) - zz };
  }
  function groupOf(zz) {
    var p = pos(zz); return p[0] >= 8 ? null : p[1];
  }
  // [row, column] in the 18-column table; rows 8/9 hold the lanthanides/actinides
  function pos(zz) {
    if (zz === 1) return [1, 1]; if (zz === 2) return [1, 18];
    var starts = [[3, 2], [11, 3], [19, 4], [37, 5], [55, 6], [87, 7]];
    for (var i = starts.length - 1; i >= 0; i--) {
      var s = starts[i][0], row = starts[i][1];
      if (zz < s) continue;
      var k = zz - s;
      if (row <= 3) return k < 2 ? [row, k + 1] : [row, k + 11];
      if (row <= 5) return [row, k + 1];
      if (k < 2) return [row, k + 1];
      if (k < 17) return k === 2 ? [row + 2, 3] : [row + 2, k + 1];   // La/Ac and the f-block below the table
      return [row, k - 14 + 1];
    }
    return [1, 1];
  }
  function configTex(q, short) {
    var e = info(q), cfg = e.config.slice(), core = '';
    if (short) {
      var nz = Object.keys(NOBLE).map(Number).filter(function (n) { return n < e.z; }).pop();
      if (nz) {
        var nc = config(nz).map(function (s) { return s[0]; });
        core = '[\\text{' + NOBLE[nz] + '}]\\,';
        cfg = cfg.filter(function (s) { return nc.indexOf(s[0]) < 0 || (config(nz).filter(function (t) { return t[0] === s[0]; })[0][1] !== s[1]); });
      }
    }
    return core + cfg.map(function (s) { return s[0][0] + '\\mathrm{' + s[0].slice(1) + '}^{' + s[1] + '}'; }).join('\\,');   // subshell letters upright
  }

  global.ChemElements = { SYM: SYM, AR: AR, MASS: MASS, CAT_AR: CAT_AR, CAT_COLOR: CAT_COLOR, info: info, config: config, configTex: configTex, pos: pos };
})(typeof window !== 'undefined' ? window : this);
