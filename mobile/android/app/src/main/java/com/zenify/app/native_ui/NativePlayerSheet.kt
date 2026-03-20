package com.zenify.app.native_ui

import androidx.compose.animation.*
import androidx.compose.animation.core.*
import androidx.compose.foundation.background
import androidx.compose.foundation.gestures.detectVerticalDragGestures
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.blur
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalConfiguration
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.IntOffset
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import coil.compose.AsyncImage
import kotlin.math.roundToInt

@OptIn(ExperimentalAnimationApi::class)
@Composable
fun NativePlayerSheet(
    trackTitle: String,
    artistName: String,
    coverUrl: String,
    isPlaying: Boolean,
    currentTime: Float,
    duration: Float,
    onTogglePlay: () -> Unit,
    onClose: () -> Unit
) {
    val configuration = LocalConfiguration.current
    val screenHeight = configuration.screenHeightDp.dp
    val density = LocalDensity.current
    
    // Animation state
    var offset by remember { mutableStateOf(0f) }
    var isExpanded by remember { mutableStateOf(false) }
    
    val screenHeightPx = with(density) { screenHeight.toPx() }
    val miniPlayerHeightPx = with(density) { 64.dp.toPx() }
    
    // Progress % (0.0 to 1.0)
    val progress = (1f - (offset / screenHeightPx)).coerceIn(0f, 1f)
    
    // Springs
    val springSpec = spring<Float>(
        dampingRatio = Spring.DampingRatioLowBouncy,
        stiffness = Spring.StiffnessLow
    )

    Box(
        modifier = Modifier
            .fillMaxSize()
            .pointerInput(Unit) {
                detectVerticalDragGestures(
                    onDragEnd = {
                        if (offset > screenHeightPx * 0.3f) {
                            onClose()
                        } else {
                            // Snap back
                            offset = 0f
                        }
                    },
                    onVerticalDrag = { _, dragAmount ->
                        offset = (offset + dragAmount).coerceAtLeast(0f)
                    }
                )
            }
            .offset { IntOffset(0, offset.roundToInt()) }
            .background(Color.Black.copy(alpha = 0.95f))
            .clip(RoundedCornerShape(topStart = 32.dp, topEnd = 32.dp))
    ) {
        // Dynamic Blur Background
        AsyncImage(
            model = coverUrl,
            contentDescription = null,
            modifier = Modifier
                .fillMaxSize()
                .blur(100.dp),
            contentScale = ContentScale.Crop,
            alpha = 0.4f
        )
        
        Box(
            modifier = Modifier
                .fillMaxSize()
                .background(
                    Brush.verticalGradient(
                        colors = listOf(Color.Transparent, Color.Black.copy(alpha = 0.8f)),
                        startY = 0f,
                        endY = screenHeightPx
                    )
                )
        )

        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(horizontal = 24.dp, vertical = 40.dp),
            horizontalAlignment = Alignment.CenterHorizontally
        ) {
            // Drag Indicator
            Box(
                modifier = Modifier
                    .width(40.dp)
                    .height(4.dp)
                    .background(Color.White.copy(alpha = 0.2f), RoundedCornerShape(full = true))
                    .padding(bottom = 24.dp)
            )

            Spacer(modifier = Modifier.height(20.dp))

            // Main Artwork
            val artworkScale by animateFloatAsState(
                targetValue = if (progress > 0.5f) 1f else 0.8f,
                animationSpec = springSpec
            )
            
            AsyncImage(
                model = coverUrl,
                contentDescription = null,
                modifier = Modifier
                    .size(340.dp)
                    .aspectRatio(1f)
                    .clip(RoundedCornerShape(24.dp))
                    .padding(12.dp)
                    .graphicsLayer(scaleX = artworkScale, scaleY = artworkScale),
                contentScale = ContentScale.Crop
            )

            Spacer(modifier = Modifier.height(48.dp))

            // Info & Heart Row
            Row(
                modifier = Modifier.fillMaxWidth(),
                verticalAlignment = Alignment.CenterVertically
            ) {
                Column(modifier = Modifier.weight(1f)) {
                    Text(
                        text = trackTitle,
                        color = Color.White,
                        fontSize = 26.sp,
                        fontWeight = FontWeight.Bold,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis
                    )
                    Text(
                        text = artistName,
                        color = Color.White.copy(alpha = 0.4f),
                        fontSize = 20.sp,
                        fontWeight = FontWeight.Medium,
                        maxLines = 1
                    )
                }
                IconButton(onClick = { }) {
                    Icon(
                        Icons.Default.FavoriteBorder,
                        contentDescription = null,
                        modifier = Modifier.size(28.dp),
                        tint = Color.White
                    )
                }
            }

            Spacer(modifier = Modifier.height(40.dp))

            // Scrubber
            Slider(
                value = currentTime,
                onValueChange = { },
                valueRange = 0f..duration,
                colors = SliderDefaults.colors(
                    thumbColor = Color.White,
                    activeTrackColor = Color.White.copy(alpha = 0.5f),
                    inactiveTrackColor = Color.White.copy(alpha = 0.1f)
                )
            )
            Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                Text(formatTime(currentTime), color = Color.White.copy(alpha = 0.3f), fontSize = 12.sp)
                Text("-" + formatTime(duration - currentTime), color = Color.White.copy(alpha = 0.3f), fontSize = 12.sp)
            }

            Spacer(modifier = Modifier.height(40.dp))

            // Controls
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceAround,
                verticalAlignment = Alignment.CenterVertically
            ) {
                IconButton(onClick = { }, modifier = Modifier.size(48.dp)) {
                    Icon(Icons.Default.SkipPrevious, contentDescription = null, tint = Color.White, modifier = Modifier.size(40.dp))
                }
                
                Surface(
                    onClick = onTogglePlay,
                    shape = RoundedCornerShape(full = true),
                    color = Color.White,
                    modifier = Modifier.size(80.dp)
                ) {
                    Box(contentAlignment = Alignment.Center) {
                        Icon(
                            imageVector = if (isPlaying) Icons.Default.Pause else Icons.Default.PlayArrow,
                            contentDescription = null,
                            tint = Color.Black,
                            modifier = Modifier.size(42.dp)
                        )
                    }
                }

                IconButton(onClick = { }, modifier = Modifier.size(48.dp)) {
                    Icon(Icons.Default.SkipNext, contentDescription = null, tint = Color.White, modifier = Modifier.size(40.dp))
                }
            }
        }
    }
}

private fun formatTime(seconds: Float): String {
    val mins = (seconds / 60).toInt()
    val secs = (seconds % 60).toInt()
    return "%d:%02d".format(mins, secs)
}
