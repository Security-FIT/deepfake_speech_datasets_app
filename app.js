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

        const table = new Tabulator("#table", {
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

        // Initialize Graph
        const cy = initGraph(corporaData, datasetsData, relationshipsData);

        // --- Search Functionality ---
        document.getElementById('searchBox').addEventListener('input', (e) => {
            const value = e.target.value.toLowerCase();
            
            if (value) {
                // Filter Table
                table.setFilter(function(data){
                    return Object.values(data).some(val => 
                        String(val).toLowerCase().includes(value)
                    );
                });

                // Filter Graph
                cy.batch(() => {
                    cy.nodes().removeClass('hidden'); 
                    cy.edges().removeClass('hidden');

                    const matchingDatasets = table.getData("active").map(row => row.Dataset);
                    
                    // Hide non-matching datasets
                    cy.nodes('[type="dataset"]').forEach(node => {
                        if (!matchingDatasets.includes(node.data('label'))) {
                            node.addClass('hidden');
                        }
                    });
                    
                    // Hide edges connected to hidden nodes
                    cy.edges().forEach(edge => {
                        if (edge.source().hasClass('hidden') || edge.target().hasClass('hidden')) {
                            edge.addClass('hidden');
                        }
                    });
                });

            } else {
                table.clearFilter();
                cy.batch(() => {
                     cy.nodes().removeClass('hidden');
                     cy.edges().removeClass('hidden');
                });
            }
        });

        // --- Reset Button ---
        const resetAll = () => {
             document.getElementById('searchBox').value = '';
             table.clearFilter();
             table.clearHeaderFilter();
             
             cy.batch(() => {
                 cy.elements().removeClass('hidden').removeClass('dimmed').removeClass('highlighted');
             });
 
             cy.fit(); 
             cy.center();
         };
 
         document.getElementById('resetBtn').addEventListener('click', resetAll);
 
         // --- Graph Interaction ---
         cy.on('tap', (e) => {
             if (e.target === cy) {
                 // Clicked on background
                 resetAll();
                 return;
             }
 
             const node = e.target;
             if (!node.isNode()) return;
 
             // Clear search box if graph interaction happens
             document.getElementById('searchBox').value = '';
             
             cy.batch(() => {
                 // Reset styles first
                 cy.elements().removeClass('highlighted').addClass('dimmed').removeClass('hidden');
 
                 // Get neighborhood (connected edges and nodes)
                 const neighborhood = node.neighborhood().add(node);
                 
                 // Apply highlighted class
                 neighborhood.removeClass('dimmed').addClass('highlighted');
 
                 // Filter Table to show connected datasets
                 // Find all dataset nodes in the selection (either the node itself or neighbors)
                 const connectedDatasetNodes = neighborhood.filter('node[type="dataset"]');
                 const datasetNames = connectedDatasetNodes.map(n => n.data('label'));
                 
                 if (datasetNames.length > 0) {
                      table.setFilter(function(data){
                         return datasetNames.includes(data.Dataset);
                     });
                 } else {
                     // If selection has no datasets (e.g. isolated corpus?), hide all rows
                     table.setFilter(() => false); 
                 }
             });
         });

    } catch (err) {
        console.error('Error loading data:', err);
    }
});

function initGraph(corporaData, datasetsData, relationshipsData) {
    // 1. Prepare elements (nodes)
    const elements = [];
    const years = new Set();
    
    // Helper to normalize year
    const parseYear = (y) => {
        if (!y) return null;
        // Check for special format "None (YYYY)" first
        const specialMatch = y.toString().match(/None \((\d{4})\)/);
        if (specialMatch) {
             const yearInt = parseInt(specialMatch[1]);
             return { year: yearInt <= 2015 ? 2015 : yearInt, isSpecial: true };
        }

        const yearInt = parseInt(y);
        if (isNaN(yearInt)) return null;
        return { year: yearInt <= 2015 ? 2015 : yearInt, isSpecial: false };
    };

    // Process corpora
    corporaData.forEach(c => {
        const res = parseYear(c.Year);
        if (res) {
            years.add(res.year);
            elements.push({
                data: { 
                    id: c.Corpus, 
                    label: c.Corpus, 
                    year: res.year, 
                    type: res.isSpecial ? 'special-corpus' : 'corpus' 
                }
            });
        }
    });

    // Process datasets
    datasetsData.forEach(d => {
        const res = parseYear(d.Year);
        if (res) {
            years.add(res.year);
            // Prefix to avoid ID collisions with corpora if names overlap
            elements.push({
                data: { id: `ds_${d.Dataset}`, label: d.Dataset, year: res.year, type: 'dataset' }
            });
        }
    });

    // Create a Set of valid node IDs for quick lookup
    const validIds = new Set(elements.map(e => e.data.id));

    // Process relationships
    relationshipsData.forEach(r => {
        if (!r.Source || !r.Target) return;

        let sourceId, targetId;

        // Determine Source ID
        if (r['Relationship Type'] && r['Relationship Type'].startsWith('Dataset')) {
             sourceId = `ds_${r.Source}`;
        } else {
             sourceId = r.Source;
        }

        // Determine Target ID
        if (r['Relationship Type'] && r['Relationship Type'].endsWith('Dataset')) {
             targetId = `ds_${r.Target}`;
        } else {
             targetId = r.Target;
        }

        // Check if nodes exist
        // Note: Sometimes a dataset might be referred to without 'ds_' prefix in relation if type is mixed, 
        // or a corpus might be missing. We try to be robust.

        if (validIds.has(sourceId) && validIds.has(targetId)) {
            elements.push({
                data: {
                    id: `${sourceId}-${targetId}`,
                    source: sourceId,
                    target: targetId,
                    language: r['Language Content'],
                    speechType: r['Speech Type']
                }
            });
        }
    });

    // Add Year nodes (timeline)
    const sortedYears = Array.from(years).sort((a, b) => a - b);
    
    // Add timeline nodes
    sortedYears.forEach(year => {
        const label = year === 2015 ? "2015 and older" : `${year}`;
         elements.push({
            data: { id: `year-${year}`, label: label, type: 'timeline', year: year }
        });
    });

    // 2. Initialize Cytoscape
    const cy = cytoscape({
        container: document.getElementById('cy'),
        elements: elements,
        style: [
            {
                selector: 'node[type="corpus"]',
                style: {
                    'background-color': '#dae8fc',
                    'border-color': '#6c8ebf',
                    'border-width': 1,
                    'label': 'data(label)',
                    'text-valign': 'center',
                    'text-halign': 'center',
                    'font-size': '10px',
                    'text-wrap': 'wrap',
                    'text-max-width': '100px',
                    'width': 'label',
                    'height': 'label',
                    'padding': 8,
                    'shape': 'round-rectangle'
                }
            },
            {
                selector: 'node[type="special-corpus"]',
                style: {
                    'background-color': 'white',
                    'border-width': 0,
                    'label': 'data(label)',
                    'text-valign': 'center',
                    'text-halign': 'center',
                    'font-size': '10px',
                    'font-style': 'italic',
                    'color': '#000000',
                    'text-wrap': 'wrap',
                    'text-max-width': '100px',
                    'width': 'label',
                    'height': 'label',
                    'padding': 5,
                    'shape': 'rectangle'
                }
            },
            {
                selector: 'node[type="dataset"]',
                style: {
                    'background-color': '#fff2cc',
                    'border-color': '#d6b656',
                    'border-width': 1,
                    'label': 'data(label)',
                    'text-valign': 'center',
                    'text-halign': 'center',
                    'font-size': '10px',
                    'text-wrap': 'wrap',
                    'text-max-width': '100px',
                    'width': 'label',
                    'height': 'label',
                    'padding': 8,
                    'shape': 'round-rectangle'
                }
            },
            {
                selector: 'node[type="timeline"]',
                style: {
                    'background-color': '#f8f9fa', 
                    'border-width': 0,
                    'label': 'data(label)',
                    'text-valign': 'center',
                    'text-halign': 'center',
                    'font-size': '12px',
                    'font-weight': 'bold',
                    'color': '#333',
                    'width': 'label',
                    'height': 20,
                    'padding': 5,
                    'shape': 'rectangle'
                }
            },
            // Edge styles
            {
                selector: 'edge',
                style: {
                    'width': 2,
                    'curve-style': 'bezier',
                    'target-arrow-shape': 'triangle'
                }
            },
            {
                selector: 'edge[language="English"]',
                style: {
                    'line-style': 'solid'
                }
            },
            {
                selector: 'edge[language="Non-English"]',
                style: {
                    'line-style': 'dashed'
                }
            },
            {
                selector: 'edge[language="English & Non-English"]',
                style: {
                    'line-style': 'dotted'
                }
            },
            {
                selector: 'edge[speechType="Real Speech"]',
                style: {
                    'line-color': '#6c8ebf',
                    'target-arrow-color': '#6c8ebf'
                }
            },
            {
                selector: 'edge[speechType="DF Speech"]',
                style: {
                    'line-color': '#e6b800', // Darker yellow for visibility
                    'target-arrow-color': '#e6b800'
                }
            },
            {
                selector: 'edge[speechType="Real & DF Speech"]',
                style: {
                    'line-color': 'green',
                    'target-arrow-color': 'green'
                }
            },
            {
                selector: '.hidden',
                style: {
                    'display': 'none'
                }
            },
            {
                selector: '.dimmed',
                style: {
                    'opacity': 0.2
                }
            },
            {
                selector: '.highlighted',
                style: {
                    'opacity': 1,
                    'font-weight': 'bold',
                    'border-width': 3
                }
            }
        ],
        layout: {
            name: 'preset' 
        }
    });

    // 3. Position nodes with dynamic height
    let currentY = 50;
    const timelineX = 50; 
    const contentStartX = 160; 
    const spacing = 120; 
    const rowHeight = 80; 
    const itemsPerRow = 1000; 

    sortedYears.forEach(year => {
        // Find all types for this year
        const nodes = cy.nodes().filter(ele => 
            (ele.data('type') === 'corpus' || ele.data('type') === 'dataset' || ele.data('type') === 'special-corpus') 
            && ele.data('year') === year
        );
        
        const nodesArray = nodes.toArray().sort((a, b) => a.data('label').localeCompare(b.data('label')));
        
        const count = nodesArray.length;
        const yearBlockHeight = rowHeight; 

        // Position Timeline Node
        const timelineNode = cy.nodes().filter(ele => ele.data('type') === 'timeline' && ele.data('year') === year);
        timelineNode.position({ 
            x: timelineX, 
            y: currentY + (yearBlockHeight / 2) 
        });

        // Position Content Nodes
        if (count > 0) {
            nodesArray.forEach((node, i) => {
                 const col = i;
                 
                 node.position({
                     x: contentStartX + (col * spacing),
                     y: currentY + (yearBlockHeight / 2)
                 });
            });
        }
        
        // Advance Y for next year
        currentY += yearBlockHeight;
    });
    
    cy.fit();
    cy.center();
    
    return cy;
}
