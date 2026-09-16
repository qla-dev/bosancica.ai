<?php

declare(strict_types=1);

set_time_limit(0);
ini_set('memory_limit', '512M');
ini_set('output_buffering', '0');
ini_set('zlib.output_compression', '0');

$baseDir = __DIR__;

if (PHP_SAPI !== 'cli') {
    header('Content-Type: text/plain; charset=utf-8');
    header('Cache-Control: no-store, no-cache, must-revalidate');
    header('X-Content-Type-Options: nosniff');
    header('X-Accel-Buffering: no');
}

while (ob_get_level() > 0) {
    ob_end_flush();
}
ob_implicit_flush(true);

$write = static function (string $message): void {
    echo $message;
    flush();
};

$lockFile = sys_get_temp_dir().DIRECTORY_SEPARATOR.'bosancica-frontend-redeploy.lock';
$lock = fopen($lockFile, 'c');

if ($lock === false || ! flock($lock, LOCK_EX | LOCK_NB)) {
    if (PHP_SAPI !== 'cli') {
        http_response_code(409);
    }
    $write("Another Bosancica frontend redeploy is already running.\n");
    exit(1);
}

register_shutdown_function(static function () use ($lock): void {
    flock($lock, LOCK_UN);
    fclose($lock);
});

$run = static function (string $command, string $cwd, callable $write): int {
    $process = proc_open(
        $command,
        [
            0 => ['pipe', 'r'],
            1 => ['pipe', 'w'],
            2 => ['pipe', 'w'],
        ],
        $pipes,
        $cwd,
    );

    if (! is_resource($process)) {
        $write("Could not start: {$command}\n");

        return 1;
    }

    fclose($pipes[0]);
    stream_set_blocking($pipes[1], false);
    stream_set_blocking($pipes[2], false);
    $exitCode = null;
    $lastOutputAt = time();

    do {
        foreach ([1, 2] as $pipeNumber) {
            while (($line = fgets($pipes[$pipeNumber])) !== false) {
                $lastOutputAt = time();
                $write($line);
            }
        }

        $status = proc_get_status($process);
        if (! $status['running']) {
            $exitCode = $status['exitcode'];
            break;
        }

        if (time() - $lastOutputAt >= 15) {
            $lastOutputAt = time();
            $write('... still running at '.date('H:i:s')."\n");
        }

        usleep(100000);
    } while (true);

    foreach ([1, 2] as $pipeNumber) {
        while (($line = fgets($pipes[$pipeNumber])) !== false) {
            $write($line);
        }
        fclose($pipes[$pipeNumber]);
    }

    $closeCode = proc_close($process);

    return is_int($exitCode) && $exitCode >= 0 ? $exitCode : $closeCode;
};

$npmCandidates = [
    '/opt/cpanel/ea-nodejs24/bin/npm',
    '/opt/cpanel/ea-nodejs22/bin/npm',
    '/opt/cpanel/ea-nodejs20/bin/npm',
    '/opt/alt/alt-nodejs24/root/usr/bin/npm',
    '/opt/alt/alt-nodejs22/root/usr/bin/npm',
    '/opt/alt/alt-nodejs20/root/usr/bin/npm',
    '/usr/local/bin/npm',
    '/usr/bin/npm',
];

foreach ([
    '/opt/cpanel/ea-nodejs*/bin/npm',
    '/opt/alt/alt-nodejs*/root/usr/bin/npm',
] as $pattern) {
    foreach (glob($pattern) ?: [] as $candidate) {
        $npmCandidates[] = $candidate;
    }
}

$npm = null;

foreach (array_unique($npmCandidates) as $candidate) {
    if (is_file($candidate) && is_executable($candidate)) {
        $npm = $candidate;
        break;
    }
}

if ($npm === null) {
    $write("Could not find npm on this server.\n");
    $write("Enable Node.js 20 or newer in cPanel, then run redeploy again.\n");
    exit(127);
}

$nodeBinDir = dirname($npm);
$currentPath = (string) (getenv('PATH') ?: '/usr/local/bin:/usr/bin:/bin');
putenv('PATH='.$nodeBinDir.PATH_SEPARATOR.$currentPath);
putenv('VITE_API_BASE_URL=https://api.bosancica.ai:82');
$npmCommand = escapeshellarg($npm);

$commands = [
    ['label' => 'Pulling latest Bosancica frontend code', 'command' => 'git pull --ff-only origin main'],
    ['label' => 'Installing frontend dependencies', 'command' => $npmCommand.' ci --no-audit --no-fund'],
    ['label' => 'Building Bosancica frontend', 'command' => $npmCommand.' run build'],
];

$startedAt = time();

foreach ($commands as $step) {
    $write("\n=== {$step['label']} ===\n");
    $write("Command: {$step['command']}\n");
    $exitCode = $run($step['command'], $baseDir, $write);

    if ($exitCode !== 0) {
        if (PHP_SAPI !== 'cli') {
            http_response_code(500);
        }
        $write("{$step['label']} failed with exit code {$exitCode}.\n");
        exit($exitCode);
    }
}

$write("\nBosancica frontend redeploy completed successfully in ".(time() - $startedAt)."s.\n");
