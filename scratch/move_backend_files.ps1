# PowerShell script to reorganize backend root files

$dbScripts = @(
    "apply_aesthetic_themes.ts", "apply_album_aesthetic.ts", "bulk_update_photos.ts", 
    "cleanup_artists.js", "comprehensive_aesthetic_overhaul.ts", "dark_genre_aesthetic_overhaul.ts", 
    "final_aesthetic_sync.ts", "fix_artist_urls.ts", "fix_broken_urls.ts", "fix_rain_deep_images.ts", 
    "fix_specific_tracks.ts", "lyrics-refine.ts", "real_world_dark_aesthetic.ts", "rescue_tracks_v3.ts", 
    "rescue_urls.ts", "safe_aesthetic_sync.ts", "selective_aesthetic_sync.ts", "update_artists_metadata.js", 
    "aesthetic_fix.js", "aesthetic_fix_v2.js", "ai_metadata_refiner.js", "restore_database.js", 
    "restore_user_images.js", "restore_user_images.ts", "init_tamil_artists.js"
)

$diagnosticScripts = @(
    "check-db-stats.js", "check-db.js", "check-db.ts", "check-track-status.js", "check-track.ts", 
    "check-tracks.js", "check-user-status.js", "check-users.js", "check_album_tracks.ts", 
    "check_all_recent.ts", "check_artist_tracks.ts", "check_atlxs_albums.ts", "check_duplicates.ts", 
    "check_recent_tracks.ts", "check_singles.ts", "check_specific_track.ts", "check_users.ts", 
    "clean-db.ts", "count-not-deleted.js", "count-tracks.js", "list-deleted-tracks.js", 
    "list_tracks.ts", "list_tracks_to_file.ts"
)

$testScripts = @(
    "debug-urls.js", "debug_artist.ts", "debug_aura_details.ts", "debug_broken.ts", "debug_counts.ts", 
    "debug_dhanush.ts", "debug_find_aura.ts", "debug_local_urls.ts", "debug_maari.ts", "debug_ramzen.ts", 
    "debug_recent.ts", "debug_search_all.ts", "debug_tracks.js", "debug_urls.ts", "debug_zendrum.js", 
    "perf-test.ts", "populate-plays.js", "print-log.js", "repro-metadata.ts", "repro_fetch.ts", 
    "save-response.ts", "test-album-fetch.ts", "test-analytics.ts", "test-conn.js", "test-db.ts", 
    "test-emails.ts", "test-mail.ts", "test-metadata.js", "test-metadata.ts", "test-oembed.js", 
    "test-payment.ts", "test-resolve.js", "test-scrape.js", "test-search.ts", "test-service.ts", 
    "test-verify.ts", "test_albums.js", "test_albums2.js", "test_albums_full.js", "test_all_0_tracks.js", 
    "test_all_active_tracks.js", "test_artist_mismatch.js", "test_empty.js", "test_empty2.js", 
    "test_import_trace.ts", "test_mismatch.js", "test_no_tracks.js", "test_results.json", 
    "test_singles.js", "test_smart_maari.ts", "test_sp.js", "test_sp_info.js", "test_sp_token.js", 
    "tmp_fix_password.js", "verify_db.ts", "verify_db_urls.ts", "verify_final.js", "get-user.ts", 
    "seed-artists.ts"
)

$logs = @(
    "db-error.log", "err_log.txt", "output_broken.log", "start_error.log", 
    "test-output.log", "yt_err.log", "yt_verbose.log"
)

Write-Host "Starting file migration inside backend/ ..."

# 1. Database Seed/Sync Utility Scripts -> backend/scripts/
foreach ($file in $dbScripts) {
    $path = "backend/$file"
    if (Test-Path $path) {
        Write-Host "Moving $file to backend/scripts/"
        git mv $path "backend/scripts/"
    }
}

# 2. Diagnostics -> backend/scratch/
foreach ($file in $diagnosticScripts) {
    $path = "backend/$file"
    if (Test-Path $path) {
        Write-Host "Moving $file to backend/scratch/"
        git mv $path "backend/scratch/"
    }
}

# 3. Tests/Debug -> backend/scratch/tests/
foreach ($file in $testScripts) {
    $path = "backend/$file"
    if (Test-Path $path) {
        Write-Host "Moving $file to backend/scratch/tests/"
        git mv $path "backend/scratch/tests/"
    }
}

# 4. Logs -> backend/scratch/logs/
foreach ($file in $logs) {
    $path = "backend/$file"
    if (Test-Path $path) {
        Write-Host "Moving $file to backend/scratch/logs/"
        git mv $path "backend/scratch/logs/"
    }
}

# 5. Media -> backend/scratch/media/
$rickAstley = "backend/Rick Astley - Never Gonna Give You Up (Official Video) (4K Remaster) [dQw4w9WgXcQ].mp4"
if (Test-Path $rickAstley) {
    Write-Host "Moving Rick Astley video to backend/scratch/media/"
    git mv $rickAstley "backend/scratch/media/"
}

# 6. Documentation -> docs/
if (Test-Path "backend/search_implementation_plan.md") {
    Write-Host "Moving search_implementation_plan.md to docs/"
    git mv "backend/search_implementation_plan.md" "docs/"
}

# 7. Untracked file: masstamilan.html -> backend/scratch/logs/
if (Test-Path "backend/masstamilan.html") {
    Write-Host "Moving untracked masstamilan.html to backend/scratch/logs/"
    Move-Item "backend/masstamilan.html" "backend/scratch/logs/" -Force
}

# 8. All JSON datasets/dumps and temp SQL -> backend/scratch/data/
# Find all json, test-result, and temp.sql files directly in backend/ root
Get-ChildItem -Path "backend" -File | Where-Object { 
    $_.Extension -eq ".json" -or $_.Name -eq "temp.sql" 
} | ForEach-Object {
    $file = $_.Name
    $path = $_.FullName
    
    # Exclude config files that must remain in backend/ root
    if ($file -ne "package.json" -and $file -ne "package-lock.json" -and $file -ne "tsconfig.json" -and $file -ne ".eslintrc.json") {
        Write-Host "Moving $file to backend/scratch/data/"
        git mv "backend/$file" "backend/scratch/data/"
    }
}

Write-Host "Migration complete!"
