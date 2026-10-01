/* Arabic molecule library for the structural-formula studio (name ar / en, SMILES) */
(function (global) {
  'use strict';
  global.MOLECULES = [
    { cat: 'صيغ بنائية مفصّلة|Full structural formulas', items: [
      ['الميثان', 'Methane', '[H]C([H])([H])[H]'],
      ['الإيثان', 'Ethane', '[H]C([H])([H])C([H])([H])[H]'],
      ['الإيثين (الإيثيلين)', 'Ethene', '[H]C([H])=C([H])[H]'],
      ['الإيثاين (الأسيتيلين)', 'Ethyne', '[H]C#C[H]'],
      ['الميثانول', 'Methanol', '[H]C([H])([H])O[H]'],
      ['الإيثانول', 'Ethanol', '[H]C([H])([H])C([H])([H])O[H]'],
      ['الماء', 'Water', '[H]O[H]'],
      ['الأمونيا', 'Ammonia', '[H]N([H])[H]'],
      ['ثاني أكسيد الكربون', 'Carbon dioxide', 'O=C=O']
    ] },
    { cat: 'الألكانات والألكينات والألكاينات|Hydrocarbons', items: [
      ['البروبان', 'Propane', 'CCC'], ['البيوتان', 'Butane', 'CCCC'], ['الأيزوبيوتان (٢-ميثيل بروبان)', 'Isobutane', 'CC(C)C'],
      ['البنتان', 'Pentane', 'CCCCC'], ['الهكسان', 'Hexane', 'CCCCCC'], ['٢،٢-ثنائي ميثيل بروبان', 'Neopentane', 'CC(C)(C)C'],
      ['البروبين', 'Propene', 'CC=C'], ['١-بيوتين', '1-Butene', 'CCC=C'], ['٢-بيوتين', '2-Butene', 'CC=CC'],
      ['البروباين', 'Propyne', 'CC#C'], ['١،٣-بيوتادايين', '1,3-Butadiene', 'C=CC=C'],
      ['البروبان الحلقي', 'Cyclopropane', 'C1CC1'], ['البنتان الحلقي', 'Cyclopentane', 'C1CCCC1'], ['الهكسان الحلقي', 'Cyclohexane', 'C1CCCCC1'], ['الهكسين الحلقي', 'Cyclohexene', 'C1CCC=CC1']
    ] },
    { cat: 'المركبات الأروماتية|Aromatic compounds', items: [
      ['البنزين', 'Benzene', 'c1ccccc1'], ['التولوين', 'Toluene', 'Cc1ccccc1'], ['أرثو-زايلين', 'o-Xylene', 'Cc1ccccc1C'],
      ['النفثالين', 'Naphthalene', 'c1ccc2ccccc2c1'], ['الأنثراسين', 'Anthracene', 'c1ccc2cc3ccccc3cc2c1'],
      ['الفينول', 'Phenol', 'Oc1ccccc1'], ['الأنيلين', 'Aniline', 'Nc1ccccc1'], ['النيتروبنزين', 'Nitrobenzene', '[O-][N+](=O)c1ccccc1'],
      ['الكلوروبنزين', 'Chlorobenzene', 'Clc1ccccc1'], ['الستايرين', 'Styrene', 'C=Cc1ccccc1'], ['حمض البنزويك', 'Benzoic acid', 'OC(=O)c1ccccc1'],
      ['البنزالدهيد', 'Benzaldehyde', 'O=Cc1ccccc1'], ['ثلاثي نيترو التولوين (TNT)', 'TNT', 'Cc1c(cc(cc1[N+](=O)[O-])[N+](=O)[O-])[N+](=O)[O-]']
    ] },
    { cat: 'الكحولات والإيثرات|Alcohols & ethers', items: [
      ['الميثانول', 'Methanol', 'CO'], ['الإيثانول', 'Ethanol', 'CCO'], ['١-بروبانول', '1-Propanol', 'CCCO'], ['٢-بروبانول', '2-Propanol', 'CC(C)O'],
      ['١-بيوتانول', '1-Butanol', 'CCCCO'], ['ثالثي بيوتانول', 'tert-Butanol', 'CC(C)(C)O'], ['الإيثيلين جلايكول', 'Ethylene glycol', 'OCCO'],
      ['الجليسرول', 'Glycerol', 'OCC(O)CO'], ['ثنائي ميثيل إيثر', 'Dimethyl ether', 'COC'], ['ثنائي إيثيل إيثر', 'Diethyl ether', 'CCOCC']
    ] },
    { cat: 'الألدهيدات والكيتونات|Aldehydes & ketones', items: [
      ['الميثانال (الفورمالدهيد)', 'Methanal', 'C=O'], ['الإيثانال (الأسيتالدهيد)', 'Ethanal', 'CC=O'], ['البروبانال', 'Propanal', 'CCC=O'],
      ['البروبانون (الأسيتون)', 'Propanone', 'CC(C)=O'], ['البيوتانون', 'Butanone', 'CCC(C)=O'], ['الهكسانون الحلقي', 'Cyclohexanone', 'O=C1CCCCC1']
    ] },
    { cat: 'الأحماض والإسترات|Acids & esters', items: [
      ['حمض الميثانويك (الفورميك)', 'Methanoic acid', 'OC=O'], ['حمض الإيثانويك (الخليك)', 'Ethanoic acid', 'CC(=O)O'], ['حمض البروبانويك', 'Propanoic acid', 'CCC(=O)O'],
      ['حمض البيوتانويك', 'Butanoic acid', 'CCCC(=O)O'], ['حمض الأكساليك', 'Oxalic acid', 'OC(=O)C(=O)O'], ['حمض اللاكتيك', 'Lactic acid', 'CC(O)C(=O)O'],
      ['حمض الستريك', 'Citric acid', 'OC(=O)CC(O)(C(=O)O)CC(=O)O'], ['حمض الستياريك', 'Stearic acid', 'CCCCCCCCCCCCCCCCCC(=O)O'],
      ['إيثانوات الإيثيل', 'Ethyl ethanoate', 'CCOC(C)=O'], ['إيثانوات الميثيل', 'Methyl ethanoate', 'COC(C)=O'], ['ميثانوات الإيثيل', 'Ethyl methanoate', 'CCOC=O'],
      ['بنزوات الميثيل', 'Methyl benzoate', 'COC(=O)c1ccccc1']
    ] },
    { cat: 'مركبات نيتروجينية وهالوجينية|N & halogen compounds', items: [
      ['ميثيل أمين', 'Methylamine', 'CN'], ['إيثيل أمين', 'Ethylamine', 'CCN'], ['ثنائي ميثيل أمين', 'Dimethylamine', 'CNC'], ['اليوريا', 'Urea', 'NC(N)=O'],
      ['الأسيتاميد', 'Acetamide', 'CC(N)=O'], ['الكلوروميثان', 'Chloromethane', 'CCl'], ['الكلوروفورم', 'Chloroform', 'ClC(Cl)Cl'],
      ['رباعي كلوريد الكربون', 'Carbon tetrachloride', 'ClC(Cl)(Cl)Cl'], ['١،٢-ثنائي برومو إيثان', '1,2-Dibromoethane', 'BrCCBr'], ['كلوريد الفاينيل', 'Vinyl chloride', 'C=CCl']
    ] },
    { cat: 'مركبات حيوية|Biomolecules', items: [
      ['الجلوكوز (سلسلة مفتوحة)', 'Glucose (open chain)', 'OC[C@@H](O)[C@@H](O)[C@H](O)[C@@H](O)C=O'],
      ['الجلوكوز (حلقي)', 'Glucose (ring)', 'OC[C@H]1OC(O)[C@H](O)[C@@H](O)[C@@H]1O'],
      ['الفركتوز', 'Fructose', 'OCC(=O)[C@@H](O)[C@H](O)[C@H](O)CO'], ['الجلايسين', 'Glycine', 'NCC(=O)O'], ['الألانين', 'Alanine', 'C[C@H](N)C(=O)O'],
      ['حمض الأسكوربيك (فيتامين ج)', 'Ascorbic acid', 'OC[C@H](O)[C@H]1OC(=O)C(O)=C1O'], ['الأدينين', 'Adenine', 'Nc1ncnc2[nH]cnc12']
    ] },
    { cat: 'أدوية ومركبات شائعة|Drugs & common', items: [
      ['الأسبرين', 'Aspirin', 'CC(=O)Oc1ccccc1C(=O)O'], ['الباراسيتامول', 'Paracetamol', 'CC(=O)Nc1ccc(O)cc1'], ['الإيبوبروفين', 'Ibuprofen', 'CC(C)Cc1ccc(cc1)C(C)C(=O)O'],
      ['الكافيين', 'Caffeine', 'CN1C=NC2=C1C(=O)N(C(=O)N2C)C'], ['النيكوتين', 'Nicotine', 'CN1CCC[C@H]1c1cccnc1'], ['الفانيلين', 'Vanillin', 'COc1cc(C=O)ccc1O'],
      ['المنثول', 'Menthol', 'CC(C)[C@@H]1CC[C@@H](C)C[C@H]1O']
    ] }
  ];
})(window);
