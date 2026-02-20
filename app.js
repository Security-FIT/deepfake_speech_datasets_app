document.addEventListener('DOMContentLoaded', async () => {
    try {
        const [corporaRes, datasetsRes, relationshipsRes] = await Promise.all([
            fetch('corpora.csv'),
            fetch('datasets.csv'),
            fetch('relationships_all.csv')
        ]);

        const corporaText = await corporaRes.text();
        const datasetsText = await datasetsRes.text();
        const relationshipsText = await relationshipsRes.text();

        // Parse CSVs
        const corporaData = Papa.parse(corporaText, { header: true, delimiter: '|', skipEmptyLines: true }).data;
        const datasetsData = Papa.parse(datasetsText, { header: true, delimiter: ',', skipEmptyLines: true }).data;
        const relationshipsData = Papa.parse(relationshipsText, { header: true, delimiter: ',', skipEmptyLines: true }).data;

        // --- Tabulator ---
        const tableData = datasetsData.map(row => ({
            ...row,
            id: row.Dataset // Add ID for Tabulator if needed, though mostly for tracking
        }));

        new Tabulator("#table", {
            data: tableData,
            layout: "fitColumns",
            height: "100%",
            columns: [
                { title: "Dataset", field: "Dataset", widthGrow: 1.2 },
                { title: "Year", field: "Year", width: 70 },
                { title: "Access", field: "Accessibility", width: 80 },
                { title: "DF Tools", field: "DF tools", width: 90 },
                { title: "Lang", field: "Language", width: 70 },
                { title: "Utterances", field: "Utterances", width: 110, hozAlign: "right" },
                { title: "Speakers (M+F)", field: "Speakers (M+F)", hozAlign: "right" },
                { title: "License", field: "License" },
            ],
        });

        // --- Search Functionality ---
        const table = Tabulator.findTable("#table")[0];
        document.getElementById('searchBox').addEventListener('input', (e) => {
            const value = e.target.value;
            if (value) {
                table.setFilter([
                    [
                        { field: "Dataset", type: "like", value: value },
                        { field: "Year", type: "like", value: value },
                        { field: "Accessibility", type: "like", value: value },
                        { field: "License", type: "like", value: value },
                    ]
                ]);
            } else {
                table.clearFilter();
            }
        });

        document.getElementById('resetBtn').addEventListener('click', () => {
            document.getElementById('searchBox').value = '';
            table.clearFilter();
            // Reset graph zoom/pan if needed
            cy.fit();
        });


        // --- Cytoscape ---
        const nodes = [];
        const edges = [];
        const nodeMap = new Map();

        // Helper to parse year
        const parseYear = (yearStr) => {
            if (!yearStr) return 2026; // Default to bottom if unknown
            const match = yearStr.match(/(\d{4})/);
            return match ? parseInt(match[1]) : 2026;
        };
        
        // Helper to decode HTML entities
        const decodeHtml = (html) => {
            const txt = document.createElement("textarea");
            txt.innerHTML = html;
            return txt.value;
        };

        // Process Corpora (Blue)
        corporaData.forEach(c => {
            if (!c.Corpus) return;
            const year = parseYear(c.Year);
            const id = c.Corpus.trim();
            nodes.push({
                data: { id: id, label: id, year: year, type: 'corpus' }
            });
            nodeMap.set(id, year);
        });

        // Process Datasets (Yellow)
        datasetsData.forEach(d => {
            if (!d.Dataset) return;
            const year = parseYear(d.Year);
            const id = d.Dataset.trim();
            // Check if already exists (some might appear in both? unlikely but good to check)
            if (!nodeMap.has(id)) {
                nodes.push({
                    data: { id: id, label: id, year: year, type: 'dataset' }
                });
                nodeMap.set(id, year);
            }
        });

        // Process Relationships (Edges)
        relationshipsData.forEach(r => {
            if (!r.Source || !r.Target) return;
            
            let source = decodeHtml(r.Source.trim());
            let target = decodeHtml(r.Target.trim());

            // Handle comma-separated sources if any (relationships_all.csv has "Aidatatang_200zh, Magic Data, freeST")
            // The parser might have handled the quotes, so r.Source is just the string.
            // But if the graph treats this as a SINGLE node or MULTIPLE nodes?
            // The CSV has line: "Aidatatang_200zh, Magic Data, freeST",DECRO,...
            // This implies the source is a group or multiple edges.
            // If I look at `corpora.csv`, do I see "Aidatatang_200zh"? Yes.
            // Do I see "Magic Data"? Yes.
            // Do I see "freeST"? Yes.
            // So these should be split into multiple edges.
            
            const sources = source.split(',').map(s => s.trim());
            
            sources.forEach(src => {
                 // Ensure nodes exist. If not found in CSVs, add them as "unknown" or just skip?
                 // Some might be missing from the lists. Let's add them as 'unknown' types if missing to ensure graph integrity.
                 if (!nodeMap.has(src)) {
                     // Try to guess year or default?
                     // Let's assume they are corpora if they are sources usually, or just generic.
                     // But for visual cleanliness, maybe check if they exist.
                     // The csv uses exact names so hopefully they match.
                     // Special case: "social media" etc might not be in corpora.csv
                     nodes.push({
                         data: { id: src, label: src, year: 2020, type: 'other' } // Default year
                     });
                     nodeMap.set(src, 2020);
                 }
                 if (!nodeMap.has(target)) {
                     nodes.push({
                         data: { id: target, label: target, year: 2020, type: 'other' }
                     });
                     nodeMap.set(target, 2020);
                 }

                 // Determine edge style
                 let edgeColor = '#000000';
                 let lineStyle = 'solid';

                 // Language Content
                 if (r['Language Content'] && r['Language Content'].toLowerCase().includes('non-english')) {
                     lineStyle = 'dashed'; // or dotted
                 }
                 
                 // Speech Type colors
                 const speechType = r['Speech Type'] ? r['Speech Type'].toLowerCase() : '';
                 if (speechType.includes('real') && speechType.includes('df')) {
                      edgeColor = '#82b366'; // Green
                 } else if (speechType.includes('real')) {
                      edgeColor = '#6c8ebf'; // Blue
                 } else if (speechType.includes('df')) {
                      edgeColor = '#d79b00'; // Orange/Yellow
                 }

                 edges.push({
                     data: { source: src, target: target, color: edgeColor, param: lineStyle }
                 });
            });
        });


        // Initialize Cytoscape
        const cy = cytoscape({
            container: document.getElementById('cy'),
            elements: [], // Add elements later
            style: [
                {
                    selector: 'node',
                    style: {
                        'label': 'data(label)',
                        'text-valign': 'center',
                        'text-halign': 'center',
                        'font-size': '12px',
                        'width': 'label',
                        'height': 24,
                        'padding': '8px',
                        'shape': 'round-rectangle',
                        'border-width': 1.5,
                        'border-color': '#000',
                        'background-color': '#fff',
                        'text-wrap': 'wrap'
                    }
                },
                {
                    selector: 'node[type="corpus"]',
                    style: {
                        'background-color': '#dae8fc',
                        'border-color': '#6c8ebf',
                        'color': '#000',
                        'shape': 'round-rectangle',
                        'font-weight': 'normal'
                    }
                },
                {
                    selector: 'node[type="dataset"]',
                    style: {
                        'background-color': '#fff2cc',
                        'border-color': '#d6b656',
                        'color': '#000',
                        'shape': 'round-rectangle'
                    }
                },
                {
                    selector: 'node[type="other"]',
                    style: {
                         'background-color': 'transparent',
                         'border-width': 0,
                         'text-valign': 'center',
                         'text-halign': 'center',
                         'color': '#333',
                         'font-style': 'italic',
                         'font-size': '11px'
                    }
                },
                {
                    selector: 'node[type="year_axis"]',
                    style: {
                        'label': 'data(label)',
                        'background-opacity': 0,
                        'border-opacity': 0,
                        'font-size': '14px',
                        'color': '#333',
                        'font-weight': 'bold',
                        'text-halign': 'right'
                    }
                },
                {
                    selector: 'edge',
                    style: {
                        'width': 1.5,
                        'line-color': '#999',
                        'target-arrow-color': '#999',
                        'target-arrow-shape': 'triangle',
                        'curve-style': 'bezier',
                        'arrow-scale': 1
                    }
                },
                {
                    selector: 'edge[color]',
                    style: {
                        'line-color': 'data(color)',
                        'target-arrow-color': 'data(color)'
                    }
                },
                {
                    selector: 'edge[param="dashed"]',
                    style: {
                        'line-style': 'dashed',
                        'line-dash-pattern': [6, 3]
                    }
                },
                {
                    selector: 'edge[type="axis_line"]',
                    style: {
                         'width': 2,
                         'line-color': '#000',
                         'target-arrow-shape': 'none',
                         'curve-style': 'straight',
                         'target-arrow-color': '#000'
                    }
                }
            ],
            layout: {
                name: 'preset' 
            }
        });

        const minYear = 2015;
        const maxYear = 2026;
        const yearAxisNodes = [];

        for (let y = minYear; y <= maxYear; y++) {
             yearAxisNodes.push({
                 data: { id: `year_${y}`, label: `${y}`, type: 'year_axis', year: y },
                 locked: true, 
                 grabbable: false
             });
        }
        
        // Add nodes and edges
        cy.add([...nodes, ...edges, ...yearAxisNodes]);

        // Run layout
        const layout = cy.layout({
            name: 'dagre',
            rankDir: 'TB',
            nodeSep: 40,
            rankSep: 60,
            padding: 50
        });

        cy.on('layoutstop', () => {
             const minY = minYear;
             const yearHeight = 120; 

             const contentNodes = cy.nodes().filter(ele => ele.data('type') !== 'year_axis');
             
             // 1. Align content nodes to year grid
             cy.batch(() => {
                 contentNodes.forEach(node => {
                     let year = node.data('year');
                     if (!year) year = maxYear; 
                     const pos = node.position();
                     node.position({
                        x: pos.x,
                        y: (year - minY) * yearHeight
                     });
                 });
             });

             // 2. Position Axis
             const bb = contentNodes.boundingBox();
             const axisX = bb.x1 - 150; 
             
             cy.batch(() => {
                 cy.nodes().filter(ele => ele.data('type') === 'year_axis').forEach(node => {
                     const year = node.data('year');
                     let label = `${year}`;
                     if (year === minYear) label = "2015\nand older";
                     
                     node.data('label', label);
                     node.position({
                         x: axisX,
                         y: (year - minY) * yearHeight
                     });
                 });
                 
                 // Add axis line edges if not already there
                 if (cy.edges('[type="axis_line"]').length === 0) {
                     const axisEdges = [];
                     for (let y = minYear; y < maxYear; y++) {
                         axisEdges.push({
                             data: { 
                                 id: `axis_edge_${y}`,
                                 source: `year_${y}`, 
                                 target: `year_${y+1}`,
                                 type: 'axis_line',
                                 color: '#000'
                             }
                         });
                     }
                     
                     cy.add(axisEdges);
                     
                     // Add arrow to the last segment
                     cy.style()
                        .selector(`#axis_edge_${maxYear-1}`)
                        .style({
                            'target-arrow-shape': 'triangle',
                            'target-arrow-color': '#000'
                        })
                        .update();
                 }
             });

             cy.fit(null, 30);
        });
        
        layout.run();


    } catch (err) {
        console.error('Error loading data:', err);
    }
});
