import React, {useState, useRef} from 'react';
import {
    Box,
    Typography,
    Button,
    Grid,
    Chip,
    Alert,
    LinearProgress,
} from '@mui/material';
import {
    CloudUpload,
    CheckCircle,
    InsertDriveFile,
} from '@mui/icons-material';

interface ConfigUploadProps {
    onUpload: (mainFile: File | null, replicaFile: File | null) => void;
    loading: boolean;
    clustersConfigured: {
        main: boolean;
        replica: boolean;
    };
}

const ConfigUpload: React.FC<ConfigUploadProps> = ({onUpload, loading, clustersConfigured}) => {
    const [mainFile, setMainFile] = useState<File | null>(null);
    const [replicaFile, setReplicaFile] = useState<File | null>(null);
    const [dragOver, setDragOver] = useState<'main' | 'replica' | null>(null);

    const mainFileInputRef = useRef<any>(null);
    const replicaFileInputRef = useRef<any>(null);

    const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>, type: 'main' | 'replica') => {
        const file = event.target.files?.[0] || null;
        if (type === 'main') setMainFile(file);
        else setReplicaFile(file);
    };

    const handleDragOver = (event: React.DragEvent, type: 'main' | 'replica') => {
        event.preventDefault();
        setDragOver(type);
    };

    const handleDragLeave = () => setDragOver(null);

    const handleDrop = (event: React.DragEvent, type: 'main' | 'replica') => {
        event.preventDefault();
        setDragOver(null);
        const file = event.dataTransfer.files[0];
        if (file) {
            if (type === 'main') setMainFile(file);
            else setReplicaFile(file);
        }
    };

    const ACCENT_COLORS: Record<'main' | 'replica', { bg: string; border: string; iconBg: string; iconColor: string }> = {
        main: {
            bg: 'linear-gradient(135deg, #eff6ff 0%, #dbeafe 100%)',
            border: '#93c5fd',
            iconBg: '#dbeafe',
            iconColor: '#1d4ed8',
        },
        replica: {
            bg: 'linear-gradient(135deg, #f5f3ff 0%, #ede9fe 100%)',
            border: '#c4b5fd',
            iconBg: '#ede9fe',
            iconColor: '#6d28d9',
        },
    };

    const FileUploadZone = ({
        type,
        file,
        onFileSelect,
        inputRef,
        configured,
    }: {
        type: 'main' | 'replica';
        file: File | null;
        onFileSelect: (event: React.ChangeEvent<HTMLInputElement>) => void;
        inputRef: React.RefObject<HTMLInputElement>;
        configured: boolean;
    }) => {
        const accent = ACCENT_COLORS[type];
        const isActive = dragOver === type;
        const label = type === 'main' ? 'Main Cluster' : 'Replica Cluster';

        return (
            <Box
                onDragOver={(e) => handleDragOver(e, type)}
                onDragLeave={handleDragLeave}
                onDrop={(e) => handleDrop(e, type)}
                sx={{
                    minHeight: 240,
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 2,
                    p: 4,
                    borderRadius: 3,
                    border: `2px dashed ${isActive ? '#326CE5' : configured ? '#86efac' : accent.border}`,
                    background: isActive
                        ? 'rgba(50, 108, 229, 0.06)'
                        : configured
                        ? 'linear-gradient(135deg, #f0fdf4 0%, #dcfce7 100%)'
                        : accent.bg,
                    transition: 'all 0.2s ease',
                    cursor: 'pointer',
                }}
                onClick={() => !loading && inputRef.current?.click()}
            >
                {/* Icon */}
                <Box sx={{
                    width: 64,
                    height: 64,
                    borderRadius: '16px',
                    background: configured ? '#bbf7d0' : isActive ? 'rgba(50,108,229,0.12)' : accent.iconBg,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    transition: 'all 0.2s ease',
                }}>
                    {configured ? (
                        <CheckCircle sx={{fontSize: 36, color: '#059669'}}/>
                    ) : file ? (
                        <InsertDriveFile sx={{fontSize: 36, color: accent.iconColor}}/>
                    ) : (
                        <CloudUpload sx={{fontSize: 36, color: isActive ? '#326CE5' : accent.iconColor}}/>
                    )}
                </Box>

                {/* Label */}
                <Box sx={{textAlign: 'center'}}>
                    <Typography variant="subtitle1" sx={{fontWeight: 700, mb: 0.5}}>
                        {label}
                    </Typography>
                    {configured ? (
                        <Chip label="Configuration loaded" color="success" size="small" icon={<CheckCircle/>}/>
                    ) : file ? (
                        <Box sx={{display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 0.5}}>
                            <Chip
                                label={file.name}
                                variant="outlined"
                                color="primary"
                                size="small"
                                icon={<InsertDriveFile/>}
                            />
                            <Typography variant="caption" color="text.secondary">
                                {(file.size / 1024).toFixed(1)} KB
                            </Typography>
                        </Box>
                    ) : (
                        <Typography variant="body2" color="text.secondary">
                            Drop kubeconfig here or{' '}
                            <Box component="span" sx={{color: 'primary.main', fontWeight: 600}}>browse</Box>
                        </Typography>
                    )}
                </Box>

                {/* Change file button (shown when file is selected) */}
                {file && !configured && (
                    <Button
                        size="small"
                        variant="outlined"
                        onClick={(e) => {
                            e.stopPropagation();
                            inputRef.current?.click();
                        }}
                        disabled={loading}
                        sx={{mt: 0.5}}
                    >
                        Change File
                    </Button>
                )}

                <input
                    ref={inputRef}
                    type="file"
                    accept=".yaml,.yml,.json,.conf"
                    style={{display: 'none'}}
                    onChange={onFileSelect}
                />
            </Box>
        );
    };

    return (
        <Box>
            <Typography variant="h5" gutterBottom>
                Upload Cluster Configurations
            </Typography>
            <Typography variant="body1" color="text.secondary" sx={{mb: 3}}>
                Upload kubeconfig files for both clusters. They'll be used to retrieve and compare secrets and configmaps.
            </Typography>

            <Alert severity="info" sx={{mb: 4}}>
                <strong>Supported formats:</strong> YAML (.yaml, .yml), Conf (.conf), JSON (.json)
            </Alert>

            {loading && (
                <Box sx={{mb: 3}}>
                    <Typography variant="body2" color="text.secondary" gutterBottom>
                        Uploading and validating...
                    </Typography>
                    <LinearProgress sx={{borderRadius: 4}}/>
                </Box>
            )}

            <Grid container spacing={3} sx={{mb: 4}}>
                <Grid size={{xs: 12, md: 6}}>
                    <FileUploadZone
                        type="main"
                        file={mainFile}
                        onFileSelect={(e) => handleFileSelect(e, 'main')}
                        inputRef={mainFileInputRef}
                        configured={clustersConfigured.main}
                    />
                </Grid>
                <Grid size={{xs: 12, md: 6}}>
                    <FileUploadZone
                        type="replica"
                        file={replicaFile}
                        onFileSelect={(e) => handleFileSelect(e, 'replica')}
                        inputRef={replicaFileInputRef}
                        configured={clustersConfigured.replica}
                    />
                </Grid>
            </Grid>

            <Box sx={{display: 'flex', justifyContent: 'center', gap: 2}}>
                <Button
                    variant="contained"
                    size="large"
                    onClick={() => onUpload(mainFile, replicaFile)}
                    disabled={!mainFile || !replicaFile || loading}
                    startIcon={<CloudUpload/>}
                    sx={{px: 4}}
                >
                    {loading ? 'Uploading...' : 'Upload Configurations'}
                </Button>

                {(mainFile || replicaFile) && (
                    <Button
                        variant="outlined"
                        size="large"
                        onClick={() => {
                            setMainFile(null);
                            setReplicaFile(null);
                            if (mainFileInputRef.current) mainFileInputRef.current.value = '';
                            if (replicaFileInputRef.current) replicaFileInputRef.current.value = '';
                        }}
                        disabled={loading}
                    >
                        Clear
                    </Button>
                )}
            </Box>

            {(clustersConfigured.main || clustersConfigured.replica) && (
                <Alert severity="success" sx={{mt: 3}}>
                    Configuration files uploaded successfully. Proceed to select namespaces.
                </Alert>
            )}
        </Box>
    );
};

export default ConfigUpload;
