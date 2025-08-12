import React, {useState} from 'react';
import {
    Box,
    Typography,
    Card,
    CardContent,
    CardActions,
    Button,
    Chip,
    Accordion,
    AccordionSummary,
    AccordionDetails,
    Alert,
    Dialog,
    DialogTitle,
    DialogContent,
    DialogActions,
    Tooltip,
    Grid,
    Switch,
    FormControlLabel,
    Tabs,
    Tab,
} from '@mui/material';
import {
    ExpandMore,
    ArrowForward,
    ArrowBack,
    Visibility,
    CheckCircle,
    Warning,
    Error,
    Info
} from '@mui/icons-material';
import ReactDiffViewer from 'react-diff-viewer';
import * as diff from 'diff';

interface ComparisonResult {
    namespace: string;
    secrets: ResourceComparison[];
    configMaps: ResourceComparison[];
}

interface ResourceComparison {
    name: string;
    type: string;
    namespace: string;
    status: 'identical' | 'different' | 'main-only' | 'replica-only';
    mainExists: boolean;
    replicaExists: boolean;
    diff: string | null;
    mainResource: any;
    replicaResource: any;
}

interface SelectedLine {
    id: string;
    resourceName: string;
    resourceType: string;
    namespace: string;
    key?: string; // For ConfigMap keys
    lineType: 'addition' | 'deletion' | 'context';
    lineContent: string;
    lineNumber: number;
    side: 'left' | 'right';
}

interface ResourceComparatorProps {
    comparisons: ComparisonResult[];
    onApplyChanges: (
        resourceName: string,
        resourceType: string,
        namespace: string,
        direction: 'main-to-replica' | 'replica-to-main',
        resourceData: any,
        originalData: any
    ) => void;
    loading: boolean;
}

const ResourceComparator: React.FC<ResourceComparatorProps> = ({
                                                                   comparisons,
                                                                   onApplyChanges,
                                                                   loading
                                                               }) => {
    const [selectedComparison, setSelectedComparison] = useState<ResourceComparison | null>(null);
    const [dialogOpen, setDialogOpen] = useState(false);
    const [showDecodedContent, setShowDecodedContent] = useState(false);
    const [confirmDialog, setConfirmDialog] = useState<{
        open: boolean;
        resource: ResourceComparison | null;
        direction: 'main-to-replica' | 'replica-to-main' | null;
    }>({open: false, resource: null, direction: null});
    const [selectedLines, setSelectedLines] = useState<SelectedLine[]>([]);
    const [currentTab, setCurrentTab] = useState(0);

    const getStatusColor = (status: string) => {
        switch (status) {
            case 'identical':
                return 'success';
            case 'different':
                return 'warning';
            case 'main-only':
                return 'info';
            case 'replica-only':
                return 'error';
            default:
                return 'default';
        }
    };

    const getStatusIcon = (status: string) => {
        switch (status) {
            case 'identical':
                return <CheckCircle/>;
            case 'different':
                return <Warning/>;
            case 'main-only':
                return <Info/>;
            case 'replica-only':
                return <Error/>;
            default:
                return <Error/>;
        }
    };

    const getStatusLabel = (status: string) => {
        switch (status) {
            case 'identical':
                return 'Identical';
            case 'different':
                return 'Different';
            case 'main-only':
                return 'Main Only';
            case 'replica-only':
                return 'Replica Only';
            default:
                return 'Unknown';
        }
    };

    // Utility function to check if a resource is an opaque secret
    const isOpaqueSecret = (comparison: ResourceComparison): boolean => {
        if (comparison.type !== 'Secret') return false;

        // Check if either resource has type "Opaque"
        const mainType = comparison.mainResource?.type;
        const replicaType = comparison.replicaResource?.type;

        return mainType === 'Opaque' || replicaType === 'Opaque';
    };

    // Utility function to decode base64 data
    const decodeBase64Data = (data: any): any => {
        if (!data || typeof data !== 'object') return data;

        const decoded: any = {};
        for (const [key, value] of Object.entries(data)) {
            if (typeof value === 'string') {
                try {
                    decoded[key] = atob(value);
                } catch (e) {
                    decoded[key] = value;
                }
            } else {
                decoded[key] = value;
            }
        }
        return decoded;
    };

    const createConfigMapKeyDiffs = (comparison: ResourceComparison): { key: string, diff: string }[] => {
        if (!comparison.mainResource && !comparison.replicaResource) return [];

        const mainData = comparison.mainResource?.data || {};
        const replicaData = comparison.replicaResource?.data || {};

        // Get all unique keys from both data objects
        const allKeys = new Set([...Object.keys(mainData), ...Object.keys(replicaData)]);
        const keyDiffs: { key: string, diff: string }[] = [];

        allKeys.forEach(key => {
            const mainValue = mainData[key] || '';
            const replicaValue = replicaData[key] || '';

            if (mainValue !== replicaValue) {
                const keyDiff = diff.createPatch(
                    key,
                    mainValue,
                    replicaValue,
                    'Main Cluster',
                    'Replica Cluster'
                );
                keyDiffs.push({key, diff: keyDiff});
            }
        });

        return keyDiffs;
    };

    const createDecodedDiff = (comparison: ResourceComparison): string | null => {
        if (!comparison.mainResource && !comparison.replicaResource) return null;

        let mainData = comparison.mainResource?.data;
        let replicaData = comparison.replicaResource?.data;

        if (showDecodedContent && isOpaqueSecret(comparison)) {
            mainData = mainData ? decodeBase64Data(mainData) : mainData;
            replicaData = replicaData ? decodeBase64Data(replicaData) : replicaData;
        }

        const mainDataStr = JSON.stringify(mainData || {}, null, 2);
        const replicaDataStr = JSON.stringify(replicaData || {}, null, 2);

        if (mainDataStr === replicaDataStr) return null;

        // Use the same diff.createPatch method as the backend
        return diff.createPatch(
            comparison.name,
            mainDataStr,
            replicaDataStr,
            'Main Cluster',
            'Replica Cluster'
        );
    };

    const handleViewDiff = (comparison: ResourceComparison) => {
        setSelectedComparison(comparison);
        setShowDecodedContent(false); // Reset toggle when opening new diff
        setCurrentTab(0); // Reset to first tab when opening new diff
        setDialogOpen(true);
    };

    const handleTabChange = (event: React.SyntheticEvent, newValue: number) => {
        setCurrentTab(newValue);
    };

    const handleLineSelection = (line: SelectedLine, isSelected: boolean) => {
        if (isSelected) {
            setSelectedLines(prev => [...prev, line]);
        } else {
            setSelectedLines(prev => prev.filter(l => l.id !== line.id));
        }
    };

    const isLineSelected = (lineId: string): boolean => {
        return selectedLines.some(line => line.id === lineId);
    };

    const handleApplyChanges = (resource: ResourceComparison, direction: 'main-to-replica' | 'replica-to-main') => {
        setConfirmDialog({
            open: true,
            resource,
            direction
        });
    };

    const confirmApplyChanges = () => {
        const {resource, direction} = confirmDialog;
        if (resource && direction) {
            const sourceResource = direction === 'main-to-replica' ? resource.mainResource : resource.replicaResource;
            const originalResource = direction === 'main-to-replica' ? resource.replicaResource : resource.mainResource;
            onApplyChanges(
                resource.name,
                resource.type,
                resource.namespace,
                direction,
                sourceResource,
                originalResource
            );
        }
        setConfirmDialog({open: false, resource: null, direction: null});
    };

    const renderDiff = (diffText: string) => {
        if (!diffText) return null;

        // Parse the unified diff to extract old and new content
        const lines = diffText.split('\n');
        let oldText = '';
        let newText = '';

        // Skip the header lines (start with @@, ---, +++)
        const contentLines = lines.filter(line =>
            !line.startsWith('@@') &&
            !line.startsWith('---') &&
            !line.startsWith('+++') &&
            !line.startsWith('Index:') &&
            line.trim() !== ''
        );

        contentLines.forEach(line => {
            if (line.startsWith('-')) {
                oldText += line.substring(1) + '\n';
            } else if (line.startsWith('+')) {
                newText += line.substring(1) + '\n';
            } else if (line.startsWith(' ')) {
                // Context line - add to both
                const contextLine = line.substring(1) + '\n';
                oldText += contextLine;
                newText += contextLine;
            }
        });

        return (
            <div style={{width: '100%', maxWidth: '100%', overflowX: 'auto', display: 'block'}}>
                <ReactDiffViewer
                    oldValue={oldText.trim()}
                    newValue={newText.trim()}
                    rightTitle={'Main Cluster'}
                    leftTitle={'Replica Cluster'}
                    splitView={true}
                    showDiffOnly={false}
                    disableWordDiff={true}
                    hideLineNumbers={false}
                    styles={{
                        lineNumber: {
                            fontSize: '10px',
                        },
                        contentText: {
                            fontSize: '10px',
                            overflow: 'hidden',
                            whiteSpace: 'nowrap',
                            textOverflow: 'ellipsis',
                            maxWidth: '750px',
                            lineHeight: '10px'
                        }
                    }}
                />
            </div>
        );
    };

    const renderSelectableDiff = (diffText: string, resourceName: string, resourceType: string, namespace: string, key?: string) => {
        if (!diffText) return null;
        const lines = diffText.split('\n');
        let oldText = '';
        let newText = '';
        const lineMapping: Map<string, {
            content: string,
            type: 'addition' | 'deletion' | 'context',
            originalLine: string
        }> = new Map();
        const contentLines = lines.filter(line =>
            !line.startsWith('@@') &&
            !line.startsWith('---') &&
            !line.startsWith('+++') &&
            !line.startsWith('Index:') &&
            line.trim() !== ''
        );

        let oldLineNum = 1;
        let newLineNum = 1;

        contentLines.forEach(line => {
            if (line.startsWith('-')) {
                const content = line.substring(1);
                oldText += content + '\n';
                lineMapping.set(`L-${oldLineNum}`, {
                    content,
                    type: 'deletion',
                    originalLine: line
                });
                oldLineNum++;
            } else if (line.startsWith('+')) {
                const content = line.substring(1);
                newText += content + '\n';
                lineMapping.set(`R-${newLineNum}`, {
                    content,
                    type: 'addition',
                    originalLine: line
                });
                newLineNum++;
            } else if (line.startsWith(' ')) {
                // Context line - add to both
                const contextLine = line.substring(1);
                oldText += contextLine + '\n';
                newText += contextLine + '\n';
                lineMapping.set(`L-${oldLineNum}`, {
                    content: contextLine,
                    type: 'context',
                    originalLine: line
                });
                lineMapping.set(`R-${newLineNum}`, {
                    content: contextLine,
                    type: 'context',
                    originalLine: line
                });
                oldLineNum++;
                newLineNum++;
            }
        });

        const handleLineClick = (lineId: string) => {
            const lineData = lineMapping.get(lineId);
            if (!lineData || lineData.type === 'context') return; // Don't allow selection of context lines

            const side = lineId.startsWith('L-') ? 'left' : 'right';
            const lineNumber = parseInt(lineId.substring(2));

            const selectedLine: SelectedLine = {
                id: `${resourceName}-${key || 'main'}-${lineId}`,
                resourceName,
                resourceType,
                namespace,
                key,
                lineType: lineData.type as 'addition' | 'deletion',
                lineContent: lineData.content,
                lineNumber,
                side
            };

            const isAlreadySelected = isLineSelected(selectedLine.id);
            handleLineSelection(selectedLine, !isAlreadySelected);
        };
        const highlightedLines = selectedLines
            .filter(line =>
                line.resourceName === resourceName &&
                line.resourceType === resourceType &&
                line.namespace === namespace &&
                line.key === key
            )
            .map(line => {
                const side = line.side === 'left' ? 'L' : 'R';
                return `${side}-${line.lineNumber}`;
            });

        return (
            <div style={{width: '100%', maxWidth: '100%', overflowX: 'auto', display: 'block'}}>
                <ReactDiffViewer
                    oldValue={oldText.trim()}
                    newValue={newText.trim()}
                    leftTitle={"Main Cluster"}
                    rightTitle={"Replica Cluster"}
                    splitView={true}
                    showDiffOnly={false}
                    disableWordDiff={true}
                    hideLineNumbers={false}
                    onLineNumberClick={handleLineClick}
                    highlightLines={highlightedLines}
                    styles={{
                        lineNumber: {
                            fontSize: '10px',
                        },
                        contentText: {
                            fontSize: '10px',
                            overflow: 'hidden',
                            whiteSpace: 'nowrap',
                            textOverflow: 'ellipsis',
                            maxWidth: '750px',
                            lineHeight: '10px !important'
                        }
                    }}
                />
                <div style={{marginTop: '16px', padding: '8px', backgroundColor: '#e3f2fd', borderRadius: '4px'}}>
                    <Typography variant="body2" color="primary">
                        💡 Click on line numbers to select/deselect specific changes.
                        Selected lines will appear in the "Selected Changes" tab.
                    </Typography>
                </div>
            </div>
        );
    };

    // Function to merge selected lines with destination resource data
    const mergeSelectedChanges = (direction: 'main-to-replica' | 'replica-to-main'): any => {
        if (selectedLines.length === 0 || !selectedComparison) return null;

        // Group selected lines by resource and key
        const changesByResource: { [key: string]: SelectedLine[] } = {};
        selectedLines.forEach(line => {
            const key = `${line.resourceName}-${line.resourceType}-${line.namespace}-${line.key || 'default'}`;
            if (!changesByResource[key]) {
                changesByResource[key] = [];
            }
            changesByResource[key].push(line);
        });

        // Get the base resource data to modify
        const sourceResource = direction === 'main-to-replica' ?
            selectedComparison.mainResource :
            selectedComparison.replicaResource;
        const destinationResource = direction === 'main-to-replica' ?
            selectedComparison.replicaResource :
            selectedComparison.mainResource;

        if (!destinationResource) return sourceResource;

        // Create a deep copy of the destination resource
        const mergedResource = JSON.parse(JSON.stringify(destinationResource));

        // Process changes for each resource/key combination
        Object.keys(changesByResource).forEach(resourceKey => {
            const changes = changesByResource[resourceKey];
            const firstChange = changes[0];

            if (firstChange.resourceType === 'ConfigMap') {
                // Handle ConfigMap key-specific changes
                if (firstChange.key && mergedResource.data) {
                    const originalValue = destinationResource.data[firstChange.key] || '';
                    const sourceValue = sourceResource?.data?.[firstChange.key] || '';

                    // For ConfigMap, apply the source value for the specific key
                    // The selected lines represent the diff, but we want to apply the complete source value
                    mergedResource.data[firstChange.key] = sourceValue;
                }
            } else {
                // Handle Secret and other resource types
                // For secrets, we typically want to merge the entire data object
                if (sourceResource?.data && mergedResource.data) {
                    // Apply selected changes by merging the source data
                    const affectedKeys = new Set<string>();
                    changes.forEach(change => {
                        // Extract key from line content if it's a JSON line
                        try {
                            const match = change.lineContent.match(/"([^"]+)":/);
                            if (match) {
                                affectedKeys.add(match[1]);
                            }
                        } catch (e) {
                            // If we can't parse, apply all source data
                        }
                    });

                    // Apply changes for affected keys
                    if (affectedKeys.size > 0) {
                        affectedKeys.forEach(key => {
                            if (sourceResource.data[key] !== undefined) {
                                mergedResource.data[key] = sourceResource.data[key];
                            }
                        });
                    } else {
                        // If we can't determine specific keys, merge all data
                        mergedResource.data = {...mergedResource.data, ...sourceResource.data};
                    }
                }
            }
        });
        console.log(mergedResource.data);
        console.log(sourceResource.data);
        console.log(destinationResource.data);

        return mergedResource;
    };

    const handleApplySelectedChanges = (direction: 'main-to-replica' | 'replica-to-main') => {
        if (!selectedComparison) return;

        const mergedResource = mergeSelectedChanges(direction);
        if (!mergedResource) {
            console.error('Failed to merge selected changes');
            return;
        }

        // Call the existing onApplyChanges function with the merged resource
        const originalResource = direction === 'main-to-replica' ?
            selectedComparison.replicaResource :
            selectedComparison.mainResource;

        // onApplyChanges(
        //     selectedComparison.name,
        //     selectedComparison.type,
        //     selectedComparison.namespace,
        //     direction,
        //     mergedResource,
        //     originalResource
        // );
        //
        // // Clear selected lines after applying changes
        // setSelectedLines([]);
    };

    const renderSelectedChanges = () => {
        if (selectedLines.length === 0) {
            return (
                <Alert severity="info">
                    No lines selected. Switch to the "Diff View" tab and select specific lines to see them here.
                </Alert>
            );
        }

        return (
            <Box>
                <Typography variant="h6" gutterBottom>
                    Selected Changes ({selectedLines.length} lines selected)
                </Typography>

                <Box sx={{mt: 2, display: 'flex', gap: 1, mb: 2}}>
                    <Button
                        variant="outlined"
                        size="small"
                        onClick={() => setSelectedLines([])}
                    >
                        Clear All Selections
                    </Button>
                    {selectedComparison && selectedComparison.mainExists && (
                        <Button
                            variant="contained"
                            color="primary"
                            size="small"
                            startIcon={<ArrowForward/>}
                            onClick={() => handleApplySelectedChanges('main-to-replica')}
                            disabled={loading}
                        >
                            Apply Changes to Replica
                        </Button>
                    )}
                    {selectedComparison && selectedComparison.replicaExists && (
                        <Button
                            variant="contained"
                            color="secondary"
                            size="small"
                            startIcon={<ArrowBack/>}
                            onClick={() => handleApplySelectedChanges('replica-to-main')}
                            disabled={loading}
                        >
                            Apply Changes to Main
                        </Button>
                    )}
                </Box>

                {selectedLines.map((line, index) => (
                    <Box key={line.id} sx={{mb: 2}}>
                        <Typography variant="subtitle2" gutterBottom>
                            {line.resourceType}: {line.resourceName}
                            {line.key && ` (Key: ${line.key})`}
                        </Typography>
                        <Box sx={{
                            border: 1,
                            borderColor: 'divider',
                            borderRadius: 1,
                            p: 1,
                            backgroundColor: line.lineType === 'addition' ? 'rgba(0, 255, 0, 0.1)' :
                                line.lineType === 'deletion' ? 'rgba(255, 0, 0, 0.1)' : 'transparent',
                            borderLeft: line.lineType === 'addition' ? '3px solid green' :
                                line.lineType === 'deletion' ? '3px solid red' : 'none'
                        }}>
                            <Typography
                                variant="body2"
                                sx={{
                                    fontFamily: 'monospace',
                                    fontSize: '12px',
                                    color: line.lineType === 'addition' ? 'success.main' :
                                        line.lineType === 'deletion' ? 'error.main' : 'text.primary'
                                }}
                            >
                                {line.lineType === 'addition' ? '+ ' : line.lineType === 'deletion' ? '- ' : '  '}
                                {line.lineContent}
                            </Typography>
                        </Box>
                    </Box>
                ))}
            </Box>
        );
    };

    const renderDiffContent = (comparison: ResourceComparison) => {
        if (!comparison) return null;

        // Special handling for ConfigMap resources - show key-by-key diffs
        if (comparison.type === 'ConfigMap') {
            const keyDiffs = createConfigMapKeyDiffs(comparison);

            if (keyDiffs.length === 0) {
                return (
                    <Alert severity="info">
                        No differences found in ConfigMap data.
                    </Alert>
                );
            }

            return (
                <Box>
                    <Typography variant="h6" gutterBottom>
                        ConfigMap Key Differences ({keyDiffs.length} key{keyDiffs.length !== 1 ? 's' : ''} differ)
                    </Typography>
                    {keyDiffs.map(({key, diff}, index) => (
                        <Box key={key} sx={{mb: 3}}>
                            <Typography variant="subtitle1" gutterBottom>
                                Key: <code>{key}</code>
                            </Typography>
                            {currentTab === 0 ?
                                renderSelectableDiff(diff, comparison.name, comparison.type, comparison.namespace, key) :
                                renderDiff(diff)
                            }
                            {index < keyDiffs.length - 1 && (
                                <Box sx={{my: 2, borderBottom: 1, borderColor: 'divider'}}/>
                            )}
                        </Box>
                    ))}
                </Box>
            );
        }
        if (isOpaqueSecret(comparison) && showDecodedContent) {
            const decodedDiff = createDecodedDiff(comparison);
            if (decodedDiff) {
                return currentTab === 0 ?
                    renderSelectableDiff(decodedDiff, comparison.name, comparison.type, comparison.namespace) :
                    renderDiff(decodedDiff);
            }
            return (
                <Alert severity="info">
                    No differences found in decoded content.
                </Alert>
            );
        }
        if (comparison.diff) {
            return currentTab === 0 ?
                renderSelectableDiff(comparison.diff, comparison.name, comparison.type, comparison.namespace) :
                renderDiff(comparison.diff);
        }

        return (
            <Alert severity="info">
                No differences found.
            </Alert>
        );
    };

    const ResourceCard = ({resource}: { resource: ResourceComparison }) => (
        <Card sx={{mb: 2}}>
            <CardContent>
                <Box sx={{display: 'flex', alignItems: 'center', mb: 2}}>
                    <Typography variant="h6" sx={{flexGrow: 1}}>
                        {resource.name}
                    </Typography>
                    <Chip
                        label={resource.type}
                        size="small"
                        variant="outlined"
                        sx={{mr: 1}}
                    />
                    <Chip
                        label={getStatusLabel(resource.status)}
                        color={getStatusColor(resource.status) as any}
                        size="small"
                        icon={getStatusIcon(resource.status)}
                    />
                </Box>

                <Grid container spacing={2}>
                    <Grid size={{xs: 6}}>
                        <Typography variant="subtitle2" color="text.secondary">
                            Main Cluster
                        </Typography>
                        <Typography variant="body2">
                            {resource.mainExists ? '✓ Exists' : '✗ Not found'}
                        </Typography>
                    </Grid>
                    <Grid size={{xs: 6}}>
                        <Typography variant="subtitle2" color="text.secondary">
                            Replica Cluster
                        </Typography>
                        <Typography variant="body2">
                            {resource.replicaExists ? '✓ Exists' : '✗ Not found'}
                        </Typography>
                    </Grid>
                </Grid>
            </CardContent>

            <CardActions sx={{justifyContent: 'space-between', px: 2, pb: 2}}>
                <Box>
                    {resource.status === 'different' && resource.diff && (
                        <Button
                            size="small"
                            startIcon={<Visibility/>}
                            onClick={() => handleViewDiff(resource)}
                        >
                            View Diff
                        </Button>
                    )}
                </Box>

                <Box sx={{display: 'flex', gap: 1}}>
                    {resource.mainExists && !resource.replicaExists && (
                        <Tooltip title="Copy from main to replica cluster">
                            <Button
                                size="small"
                                variant="outlined"
                                startIcon={<ArrowForward/>}
                                onClick={() => handleApplyChanges(resource, 'main-to-replica')}
                                disabled={loading}
                            >
                                Copy to Replica
                            </Button>
                        </Tooltip>
                    )}

                    {resource.replicaExists && !resource.mainExists && (
                        <Tooltip title="Copy from replica to main cluster">
                            <Button
                                size="small"
                                variant="outlined"
                                startIcon={<ArrowBack/>}
                                onClick={() => handleApplyChanges(resource, 'replica-to-main')}
                                disabled={loading}
                            >
                                Copy to Main
                            </Button>
                        </Tooltip>
                    )}

                    {resource.status === 'different' && (
                        <>
                            <Tooltip title="Apply main cluster version to replica">
                                <Button
                                    size="small"
                                    variant="outlined"
                                    startIcon={<ArrowForward/>}
                                    onClick={() => handleApplyChanges(resource, 'main-to-replica')}
                                    disabled={loading}
                                >
                                    Main → Replica
                                </Button>
                            </Tooltip>
                            <Tooltip title="Apply replica cluster version to main">
                                <Button
                                    size="small"
                                    variant="outlined"
                                    startIcon={<ArrowBack/>}
                                    onClick={() => handleApplyChanges(resource, 'replica-to-main')}
                                    disabled={loading}
                                >
                                    Replica → Main
                                </Button>
                            </Tooltip>
                        </>
                    )}
                </Box>
            </CardActions>
        </Card>
    );

    const totalResources = comparisons.reduce((sum, comp) =>
        sum + comp.secrets.length + comp.configMaps.length, 0
    );

    const statusCounts = comparisons.reduce((counts, comp) => {
        [...comp.secrets, ...comp.configMaps].forEach(resource => {
            counts[resource.status] = (counts[resource.status] || 0) + 1;
        });
        return counts;
    }, {} as Record<string, number>);

    return (
        <Box>
            <Typography variant="h5" gutterBottom>
                Resource Comparison Results
            </Typography>

            {/* Summary Cards */}
            <Grid container spacing={2} sx={{mb: 4}}>
                <Grid size={{xs: 6, sm: 3}}>
                    <Card>
                        <CardContent sx={{textAlign: 'center'}}>
                            <Typography variant="h4" color="primary">
                                {totalResources}
                            </Typography>
                            <Typography variant="body2" color="text.secondary">
                                Total Resources
                            </Typography>
                        </CardContent>
                    </Card>
                </Grid>
                <Grid size={{xs: 6, sm: 3}}>
                    <Card>
                        <CardContent sx={{textAlign: 'center'}}>
                            <Typography variant="h4" color="success.main">
                                {statusCounts['identical'] || 0}
                            </Typography>
                            <Typography variant="body2" color="text.secondary">
                                Identical
                            </Typography>
                        </CardContent>
                    </Card>
                </Grid>
                <Grid size={{xs: 6, sm: 3}}>
                    <Card>
                        <CardContent sx={{textAlign: 'center'}}>
                            <Typography variant="h4" color="warning.main">
                                {statusCounts['different'] || 0}
                            </Typography>
                            <Typography variant="body2" color="text.secondary">
                                Different
                            </Typography>
                        </CardContent>
                    </Card>
                </Grid>
                <Grid size={{xs: 6, sm: 3}}>
                    <Card>
                        <CardContent sx={{textAlign: 'center'}}>
                            <Typography variant="h4" color="error.main">
                                {(statusCounts['main-only'] || 0) + (statusCounts['replica-only'] || 0)}
                            </Typography>
                            <Typography variant="body2" color="text.secondary">
                                Missing
                            </Typography>
                        </CardContent>
                    </Card>
                </Grid>
            </Grid>

            {/* Resource Comparisons by Namespace */}
            {comparisons.map((comparison) => (
                <Accordion key={comparison.namespace} defaultExpanded>
                    <AccordionSummary expandIcon={<ExpandMore/>}>
                        <Typography variant="h6">
                            Namespace: {comparison.namespace}
                        </Typography>
                        <Box sx={{ml: 'auto', mr: 2, display: 'flex', gap: 1}}>
                            <Chip
                                label={`${comparison.secrets.length} Secrets`}
                                size="small"
                                variant="outlined"
                            />
                            <Chip
                                label={`${comparison.configMaps.length} ConfigMaps`}
                                size="small"
                                variant="outlined"
                            />
                        </Box>
                    </AccordionSummary>
                    <AccordionDetails>
                        {/* Secrets */}
                        {comparison.secrets.length > 0 && (
                            <Box sx={{mb: 3}}>
                                <Typography variant="subtitle1" gutterBottom>
                                    Secrets
                                </Typography>
                                {comparison.secrets.map((secret) => (
                                    <ResourceCard key={`secret-${secret.name}`} resource={secret}/>
                                ))}
                            </Box>
                        )}

                        {/* ConfigMaps */}
                        {comparison.configMaps.length > 0 && (
                            <Box>
                                <Typography variant="subtitle1" gutterBottom>
                                    ConfigMaps
                                </Typography>
                                {comparison.configMaps.map((configMap) => (
                                    <ResourceCard key={`configmap-${configMap.name}`} resource={configMap}/>
                                ))}
                            </Box>
                        )}

                        {comparison.secrets.length === 0 && comparison.configMaps.length === 0 && (
                            <Alert severity="info">
                                No secrets or configmaps found in this namespace.
                            </Alert>
                        )}
                    </AccordionDetails>
                </Accordion>
            ))}

            {/* Diff Viewer Dialog */}
            <Dialog
                open={dialogOpen}
                onClose={() => setDialogOpen(false)}
                maxWidth="xl"
                fullWidth
            >
                <DialogTitle>
                    <Box sx={{display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start'}}>
                        <Box>
                            Difference View: {selectedComparison?.name}
                            <Typography variant="subtitle2" color="text.secondary">
                                {selectedComparison?.type} in {selectedComparison?.namespace}
                            </Typography>
                        </Box>
                        {selectedComparison && isOpaqueSecret(selectedComparison) && (
                            <FormControlLabel
                                control={
                                    <Switch
                                        checked={showDecodedContent}
                                        onChange={(e) => setShowDecodedContent(e.target.checked)}
                                        size="small"
                                    />
                                }
                                label={
                                    <Typography variant="body2">
                                        Decode Base64
                                    </Typography>
                                }
                                labelPlacement="start"
                            />
                        )}
                    </Box>
                </DialogTitle>
                <DialogContent>
                    <Box sx={{borderBottom: 1, borderColor: 'divider'}}>
                        <Tabs value={currentTab} onChange={handleTabChange}>
                            <Tab label="Diff View"/>
                            <Tab label={`Selected Changes (${selectedLines.length})`}/>
                        </Tabs>
                    </Box>
                    <Box sx={{mt: 2}}>
                        {currentTab === 0 && selectedComparison && renderDiffContent(selectedComparison)}
                        {currentTab === 1 && renderSelectedChanges()}
                    </Box>
                </DialogContent>
                <DialogActions>
                    <Button onClick={() => setDialogOpen(false)}>Close</Button>
                </DialogActions>
            </Dialog>

            {/* Confirmation Dialog */}
            <Dialog
                open={confirmDialog.open}
                onClose={() => setConfirmDialog({open: false, resource: null, direction: null})}
            >
                <DialogTitle>Confirm Apply Changes</DialogTitle>
                <DialogContent>
                    <Typography paragraph>
                        Are you sure you want to apply
                        the {confirmDialog.direction === 'main-to-replica' ? 'main cluster' : 'replica cluster'} version
                        of{' '}
                        <strong>{confirmDialog.resource?.name}</strong> to the{' '}
                        {confirmDialog.direction === 'main-to-replica' ? 'replica' : 'main'} cluster?
                    </Typography>
                    <Alert severity="warning">
                        This action will overwrite the existing resource in the target cluster.
                    </Alert>
                </DialogContent>
                <DialogActions>
                    <Button
                        onClick={() => setConfirmDialog({open: false, resource: null, direction: null})}
                    >
                        Cancel
                    </Button>
                    <Button
                        onClick={confirmApplyChanges}
                        variant="contained"
                        disabled={loading}
                    >
                        {loading ? 'Applying...' : 'Apply Changes'}
                    </Button>
                </DialogActions>
            </Dialog>
        </Box>
    );
};

export default ResourceComparator;
