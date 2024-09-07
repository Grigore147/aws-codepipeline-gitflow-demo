# Display a message with an optional color
# 
# Usage example:
# display "[ SUCCESS ]" "success"; echo " Message";
# 
display() {
    if [ "$2" == "info" ] ; then
        COLOR="96m"
    elif [ "$2" == "success" ] ; then
        COLOR="92m"
    elif [ "$2" == "warning" ] ; then
        COLOR="93m"
    elif [ "$2" == "danger" ] ; then
        COLOR="91m"
    elif [ "$2" == "error" ] ; then
        COLOR="91m"
    elif [ "$2" == "black" ] ; then
        COLOR="30m"   
    elif [ "$2" == "red" ] ; then
        COLOR="31m" 
    elif [ "$2" == "green" ] ; then
        COLOR="32m"
    elif [ "$2" == "yellow" ] ; then
        COLOR="33m"
    elif [ "$2" == "blue" ] ; then
        COLOR="34m"
    elif [ "$2" == "magenta" ] ; then
        COLOR="35m"
    elif [ "$2" == "cyan" ] ; then
        COLOR="36m"
    elif [ "$2" == "light-gray" ] ; then
        COLOR="37m"
    elif [ "$2" == "dark-gray" ] ; then
        COLOR="90m"
    elif [ "$2" == "light-red" ] ; then
        COLOR="91m"
    elif [ "$2" == "light-green" ] ; then
        COLOR="92m"
    elif [ "$2" == "light-yellow" ] ; then
        COLOR="93m"
    elif [ "$2" == "light-blue" ] ; then
        COLOR="94m"
    elif [ "$2" == "light-magenta" ] ; then
        COLOR="95m"
    elif [ "$2" == "light-cyan" ] ; then
        COLOR="96m"
    elif [ "$2" == "white" ] ; then
        COLOR="97m"
    else #default color
        COLOR="0m"
    fi

    STARTCOLOR="\e[$COLOR"
    ENDCOLOR="\e[0m"

    printf "$STARTCOLOR%b$ENDCOLOR" "$1"
}

print_info() {
    # display "[  INFO   ] " "info"; echo "$1";
    display "[ ▣ ] " "info"; echo "$1";
}

print_info_progress() {
    # display "[  INFO   ] " "info"; echo "$1";
    display "[ ◈ ] " "info"; echo "$1";
}

print_success() {
    # display "[ SUCCESS ] " "success"; echo "$1";
    display "[ ▣ ] " "success"; echo "$1";
}

print_warning() {
    # display "[ WARNING ] " "warning"; echo "$1";
    display "[ ▣ ] " "warning"; echo "$1";
}

print_danger() {
    # display "[ DANGER  ] " "danger"; echo "$1";
    display "[ ▣ ] " "danger"; echo "$1";
}

print_error() {
    # display "[  ERROR  ] " "error"; echo "$1";
    display "[ ▣ ] " "error"; echo "$1";
}


# Check if a remote Git branch exists
# Usage example:
# if git_remote_branch_exists "master"; then
#   echo "Branch master exists!"
# fi;
git_remote_branch_exists() {
    git show-ref --quiet --verify -- "refs/remotes/origin/$1";

    if [ $? -eq 0 ]
    then
      return 0;
    else
      return 1;
    fi
}

# Safely checkout a Git branch (create if doesn't exist)
git_checkout_branch() {
    if ! git_remote_branch_exists "$1"; then
        git checkout -b $1
    else
        git checkout $1
    fi;
}

# JQ Update
# Update a value in a JSON file using jq
# Example usage:
# jq-update accounts.json AWS_ACCOUNT_ID 123456789012
jq-update() {
    local file="$1"
    local key="$2"
    local value="$3"

    # Ensure file exists
    if [[ ! -f "$file" ]]; then
        echo "File not found: $file"
        return 1
    fi

    # Escape the value for use in jq
    value=$(printf '%s' "$value" | jq -R .)

    # Handle nested keys by transforming dot notation to jq path
    jq_filter=$(printf '.%s = %s' "$(echo "$key" | sed 's/\./\./g')" "$value")

    # Read original JSON content, update the value, and keep original formatting
    TEMP=$(jq "$jq_filter" "$file")

    # Test if TEMP is valid JSON
    if ! echo "$TEMP" | jq > /dev/null 2>&1; then
        echo "Error: Updated JSON is not valid."
        return 1
    fi

    # Pretty-print the JSON and overwrite the original file
    echo "$TEMP" | jq --indent 2 '.' > "$file"
}

# Print repeat
# Repeat a string N times
# Example usage:
# print_repeat "▣" 10
function print_repeat() {
    local end=$2 i
    for ((i = 0; i < end; i++)); do
        echo -n "$1"
    done
    echo
}
